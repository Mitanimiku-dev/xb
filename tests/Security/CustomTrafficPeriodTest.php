<?php

namespace Tests\Security;

require_once __DIR__ . '/IsolatedTestCase.php';

use App\Exceptions\ApiException;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Services\Auth\RegisterService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use PHPUnit\Framework\Attributes\DataProvider;
use Plugin\CustomTraffic\Controllers\CustomTrafficController;

class CustomTrafficPeriodTest extends IsolatedTestCase
{
    private TestCustomTrafficController $controller;
    private Plan $plan;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->plan = Plan::forceCreate([
            'id' => 9,
            'name' => 'Custom traffic',
            'group_id' => 1,
            'transfer_enable' => 80,
            'show' => true,
            'sell' => true,
            'renew' => true,
            'prices' => [
                Plan::PERIOD_MONTHLY => '25',
                Plan::PERIOD_QUARTERLY => '60',
                Plan::PERIOD_ONETIME => null,
                Plan::PERIOD_RESET_TRAFFIC => null,
            ],
        ]);
        $this->user = User::forceCreate([
            'email' => 'security-test@example.com',
            'plan_id' => $this->plan->id,
            'group_id' => 1,
            'transfer_enable' => 80 * 1073741824,
            'expired_at' => time() + 86400,
        ]);
        $this->controller = new TestCustomTrafficController([
            'plan_ids' => [9],
            'public_plan_id' => 9,
        ]);
    }

    public static function disabledPeriodEntryPoints(): array
    {
        $cases = [];
        foreach (['onetime', 'onetime_price'] as $period) {
            foreach (['publicQuote', 'quote', 'hold', 'order', 'registerOrder', 'consumePending'] as $entry) {
                $cases[$entry . '-' . $period] = [$entry, $period];
            }
        }
        return $cases;
    }

    #[DataProvider('disabledPeriodEntryPoints')]
    public function testDisabledOnetimePeriodIsRejectedBeforeSideEffects(string $entry, string $period): void
    {
        $token = str_repeat('a', 64);
        $beforeUsers = User::count();

        if (in_array($entry, ['registerOrder', 'consumePending'], true)) {
            Cache::put('CUSTOM_TRAFFIC_PENDING_' . $token, [
                'plan_id' => 9,
                'traffic_gb' => 80,
                'period' => $period,
                'monthly_price' => 2500,
            ], 900);
        }

        $registerService = $this->createMock(RegisterService::class);
        $registerService->expects($this->never())->method('register');
        $this->app->instance(RegisterService::class, $registerService);

        try {
            $this->invokeEntryPoint($entry, $period, $token);
            $this->fail('A disabled payment period was accepted.');
        } catch (ApiException $exception) {
            $this->assertStringContainsString('cannot be purchased', $exception->getMessage());
        }

        $this->assertSame(0, Order::count());
        $this->assertSame($beforeUsers, User::count());
    }

    public function testARealEnabledOnetimePeriodAndLegacyAliasRemainAvailable(): void
    {
        $prices = $this->plan->prices;
        $prices[Plan::PERIOD_ONETIME] = '45';
        $this->plan->prices = $prices;
        $this->plan->save();

        foreach (['onetime', 'onetime_price'] as $period) {
            $response = $this->controller->publicQuote(Request::create('/', 'POST', [
                'traffic_gb' => 80,
                'period' => $period,
            ]));
            $payload = $response->getData(true);

            $this->assertSame('onetime', $payload['data']['period']);
            $this->assertSame(2500, $payload['data']['total_amount']);
        }
    }

    public function testResetTrafficPurchaseDoesNotDependOnAPlanResetPrice(): void
    {
        $request = Request::create('/', 'POST', [
            'plan_id' => 9,
            'period' => 'reset_price',
        ]);
        $request->setUserResolver(fn () => $this->user);

        $response = $this->controller->order($request);
        $tradeNo = $response->getData(true)['data'];
        $order = Order::where('trade_no', $tradeNo)->firstOrFail();

        $this->assertSame(Plan::PERIOD_RESET_TRAFFIC, $order->period);
        $this->assertSame(2500, (int) $order->total_amount);
    }

    public function testUnknownPeriodIsRejected(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('无效的套餐周期');

        $this->controller->publicQuote(Request::create('/', 'POST', [
            'traffic_gb' => 80,
            'period' => 'forever',
        ]));
    }

    private function invokeEntryPoint(string $entry, string $period, string $token): void
    {
        if ($entry === 'consumePending') {
            $this->controller->consumePending($token, $this->user);
            return;
        }

        $parameters = match ($entry) {
            'publicQuote' => ['traffic_gb' => 80, 'period' => $period],
            'quote' => ['plan_id' => 9, 'traffic_gb' => 80, 'period' => $period],
            'hold' => ['plan_id' => 9, 'traffic_gb' => 80, 'period' => $period],
            'order' => ['plan_id' => 9, 'traffic_gb' => 80, 'period' => $period],
            'registerOrder' => [
                'email' => 'new-user@example.com',
                'password' => 'valid-password',
                'invite_code' => 'INVITE',
                'plan_token' => $token,
            ],
        };
        $request = Request::create('/', 'POST', $parameters);
        $request->setUserResolver(fn () => $this->user);
        $this->controller->{$entry}($request);
    }
}

class TestCustomTrafficController extends CustomTrafficController
{
    public function __construct(private readonly array $testConfig)
    {
    }

    protected function beforePluginAction(): ?array
    {
        return null;
    }

    public function getConfig(?string $key = null, $default = null): mixed
    {
        if ($key === null) {
            return $this->testConfig;
        }
        return $this->testConfig[$key] ?? $default;
    }
}
