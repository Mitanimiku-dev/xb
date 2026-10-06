<?php

namespace App\Http\Controllers\V1\Guest;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderService;
use App\Services\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Services\Plugin\HookManager;

class PaymentController extends Controller
{
    public function notify($method, $uuid, Request $request)
    {
        HookManager::call('payment.notify.before', [$method, $uuid, $request]);
        try {
            $paymentService = new PaymentService($method, null, $uuid);
            $verify = $paymentService->notify($request->input());
            if (!$verify) {
                HookManager::call('payment.notify.failed', [$method, $uuid, $request]);
                return $this->fail([422, 'verify error']);
            }
            HookManager::call('payment.notify.verified', $verify);
            if (!$this->handle($verify)) {
                return $this->fail([400, 'handle error']);
            }
            return (isset($verify['custom_result']) ? $verify['custom_result'] : 'success');
        } catch (\Exception $e) {
            Log::error($e);
            return $this->fail([500, 'fail']);
        }
    }

    private function handle(array $verify): bool
    {
        $paidOrder = null;
        $handled = DB::transaction(function () use ($verify, &$paidOrder) {
            $order = Order::where('trade_no', $verify['trade_no'])->lockForUpdate()->first();
            if (!$order || (int) $order->payment_id !== $verify['payment_id']) {
                return false;
            }
            if (array_key_exists('total_amount', $verify) &&
                $verify['total_amount'] !== (int) $order->total_amount + (int) $order->handling_amount) {
                return false;
            }
            if ($order->status !== Order::STATUS_PENDING) {
                return in_array($order->status, [
                    Order::STATUS_PROCESSING,
                    Order::STATUS_COMPLETED,
                    Order::STATUS_DISCOUNTED,
                ], true) && (string) $order->callback_no === (string) $verify['callback_no'];
            }
            $orderService = new OrderService($order);
            if (!$orderService->paid($verify['callback_no'])) {
                throw new \RuntimeException('Failed to process verified payment');
            }
            $paidOrder = $order;
            return true;
        });

        if ($paidOrder) {
            HookManager::call('payment.notify.success', $paidOrder);
        }
        return $handled;
    }
}
