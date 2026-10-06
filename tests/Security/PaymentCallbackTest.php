<?php

namespace Tests\Security;

require_once __DIR__ . '/IsolatedTestCase.php';
require_once dirname(__DIR__, 2) . '/plugins-core/Epay/Plugin.php';

use App\Exceptions\ApiException;
use App\Http\Controllers\V1\Guest\PaymentController;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\PaymentService;
use App\Services\Plugin\HookManager;
use App\Services\Plugin\PluginManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Plugin\Epay\Plugin as EpayPlugin;

class PaymentCallbackTest extends IsolatedTestCase
{
    private const PID = 'merchant-100';
    private const KEY = 'test-secret-key';

    private EpayPlugin $epay;
    private PaymentController $controller;

    protected function setUp(): void
    {
        parent::setUp();

        $this->epay = new EpayPlugin('epay');
        $this->epay->setConfig([
            'pid' => self::PID,
            'key' => self::KEY,
            'enabled' => true,
        ]);
        $this->epay->boot();

        $pluginManager = $this->createMock(PluginManager::class);
        $pluginManager->method('getEnabledPaymentPlugins')->willReturn([$this->epay]);
        $this->app->instance(PluginManager::class, $pluginManager);

        Payment::forceCreate([
            'id' => 5,
            'payment' => 'EPay',
            'uuid' => 'epay-security-test',
            'config' => ['pid' => self::PID, 'key' => self::KEY],
            'enable' => true,
        ]);

        $this->controller = new PaymentController();
    }

    public function testEpayAcceptsOnlySuccessfulSignedCallbacksAndParsesCentsExactly(): void
    {
        foreach (['10' => 1000, '10.0' => 1000, '10.01' => 1001] as $money => $expected) {
            $verified = $this->epay->notify($this->signedParams(['money' => $money]));
            $this->assertIsArray($verified);
            $this->assertSame($expected, $verified['total_amount']);
        }

        foreach ([
            ['trade_status' => 'WAIT_BUYER_PAY'],
            ['pid' => 'another-merchant'],
            ['money' => '0'],
            ['money' => '-1'],
            ['money' => '1e2'],
            ['money' => '10.001'],
            ['money' => '12345678901'],
        ] as $changes) {
            $this->assertFalse($this->epay->notify($this->signedParams($changes)));
        }

        $badSignature = $this->signedParams();
        $badSignature['sign'] = str_repeat('0', 32);
        $this->assertFalse($this->epay->notify($badSignature));

        $arrayField = $this->signedParams();
        $arrayField['trade_no'] = ['not', 'scalar'];
        $this->assertFalse($this->epay->notify($arrayField));
    }

    public function testPaymentServiceBindsVerifiedCallbackToDatabaseGateway(): void
    {
        $verified = (new PaymentService('EPay', null, 'epay-security-test'))
            ->notify($this->signedParams(['money' => '10.50']));

        $this->assertSame(5, $verified['payment_id']);
        $this->assertSame(1050, $verified['total_amount']);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('payment method mismatch');
        new PaymentService('AnotherGateway', null, 'epay-security-test');
    }

    public function testWrongAmountAndWrongOrderGatewayCannotMarkOrderPaid(): void
    {
        [$user, $order] = $this->createPayableOrder();

        $underpaid = $this->notify($this->signedParams(['money' => '10.49']));
        $this->assertInstanceOf(JsonResponse::class, $underpaid);
        $this->assertSame(400, $underpaid->getStatusCode());
        $this->assertOrderStillPending($order, $user);

        $order->payment_id = 6;
        $order->save();
        $wrongGateway = $this->notify($this->signedParams(['money' => '10.50']));
        $this->assertInstanceOf(JsonResponse::class, $wrongGateway);
        $this->assertSame(400, $wrongGateway->getStatusCode());
        $this->assertOrderStillPending($order, $user);
    }

    public function testSuccessfulAndDuplicateCallbacksOpenSubscriptionOnlyOnce(): void
    {
        [$user, $order] = $this->createPayableOrder();
        $originalExpiry = (int) $user->expired_at;
        $successCalls = 0;
        HookManager::register('payment.notify.success', static function () use (&$successCalls) {
            $successCalls++;
        });

        $params = $this->signedParams(['money' => '10.50']);
        $this->assertSame('success', $this->notify($params));

        $order->refresh();
        $user->refresh();
        $firstExpiry = (int) $user->expired_at;
        $this->assertSame(Order::STATUS_COMPLETED, (int) $order->status);
        $this->assertSame('gateway-trade-1', $order->callback_no);
        $this->assertGreaterThan($originalExpiry, $firstExpiry);

        $this->assertSame('success', $this->notify($params));
        $this->assertSame($firstExpiry, (int) $user->fresh()->expired_at);
        $this->assertSame(1, $successCalls);

        $differentCallback = $this->signedParams([
            'money' => '10.50',
            'trade_no' => 'gateway-trade-2',
        ]);
        $response = $this->notify($differentCallback);
        $this->assertInstanceOf(JsonResponse::class, $response);
        $this->assertSame(400, $response->getStatusCode());
    }

    public function testOpeningFailureRollsBackOrderAndSubscriptionAndCanRetry(): void
    {
        [$user, $order] = $this->createPayableOrder();
        $originalExpiry = (int) $user->expired_at;
        $failure = static function () {
            throw new \RuntimeException('simulated open failure');
        };
        HookManager::register('order.open.after', $failure);

        $response = $this->notify($this->signedParams(['money' => '10.50']));
        $this->assertInstanceOf(JsonResponse::class, $response);
        $this->assertSame(500, $response->getStatusCode());
        $this->assertOrderStillPending($order, $user, $originalExpiry);

        HookManager::remove('order.open.after', $failure);
        $this->assertSame('success', $this->notify($this->signedParams(['money' => '10.50'])));
        $this->assertSame(Order::STATUS_COMPLETED, (int) $order->fresh()->status);
        $this->assertGreaterThan($originalExpiry, (int) $user->fresh()->expired_at);
    }

    public function testCancelledOrderAndMissingOrderAreRejected(): void
    {
        [, $order] = $this->createPayableOrder();
        $order->status = Order::STATUS_CANCELLED;
        $order->save();

        $cancelled = $this->notify($this->signedParams(['money' => '10.50']));
        $this->assertInstanceOf(JsonResponse::class, $cancelled);
        $this->assertSame(400, $cancelled->getStatusCode());

        $missing = $this->notify($this->signedParams([
            'money' => '10.50',
            'out_trade_no' => 'missing-order',
        ]));
        $this->assertInstanceOf(JsonResponse::class, $missing);
        $this->assertSame(400, $missing->getStatusCode());
    }

    private function createPayableOrder(): array
    {
        $plan = Plan::forceCreate([
            'id' => 9,
            'name' => 'Payment test plan',
            'group_id' => 2,
            'transfer_enable' => 80,
            'show' => true,
            'sell' => true,
            'renew' => true,
            'prices' => [Plan::PERIOD_MONTHLY => '10'],
        ]);
        $user = User::forceCreate([
            'email' => 'payment-test@example.com',
            'plan_id' => $plan->id,
            'group_id' => $plan->group_id,
            'transfer_enable' => 80 * 1073741824,
            'expired_at' => time() + 86400,
        ]);
        $order = Order::forceCreate([
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'payment_id' => 5,
            'period' => Plan::PERIOD_MONTHLY,
            'trade_no' => 'ORDER-SECURITY-1',
            'total_amount' => 1000,
            'handling_amount' => 50,
            'type' => Order::TYPE_RENEWAL,
            'status' => Order::STATUS_PENDING,
        ]);

        return [$user, $order];
    }

    private function notify(array $params): mixed
    {
        return $this->controller->notify(
            'EPay',
            'epay-security-test',
            Request::create('/', 'POST', $params)
        );
    }

    private function signedParams(array $changes = []): array
    {
        $params = array_merge([
            'pid' => self::PID,
            'trade_status' => 'TRADE_SUCCESS',
            'out_trade_no' => 'ORDER-SECURITY-1',
            'trade_no' => 'gateway-trade-1',
            'money' => '10.00',
        ], $changes);
        ksort($params);
        $params['sign'] = md5(stripslashes(urldecode(http_build_query($params))) . self::KEY);
        $params['sign_type'] = 'MD5';

        return $params;
    }

    private function assertOrderStillPending(Order $order, User $user, ?int $expectedExpiry = null): void
    {
        $order->refresh();
        $user->refresh();

        $this->assertSame(Order::STATUS_PENDING, (int) $order->status);
        $this->assertNull($order->paid_at);
        $this->assertNull($order->callback_no);
        if ($expectedExpiry !== null) {
            $this->assertSame($expectedExpiry, (int) $user->expired_at);
        }
    }
}
