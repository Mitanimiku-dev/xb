<?php

namespace Plugin\Epay;

use App\Services\Plugin\AbstractPlugin;
use App\Contracts\PaymentInterface;

class Plugin extends AbstractPlugin implements PaymentInterface
{
    public function boot(): void
    {
        $this->filter('available_payment_methods', function ($methods) {
            if ($this->getConfig('enabled', true)) {
                $methods['EPay'] = [
                    'name' => $this->getConfig('display_name', '易支付'),
                    'icon' => $this->getConfig('icon', '💳'),
                    'plugin_code' => $this->getPluginCode(),
                    'type' => 'plugin'
                ];
            }
            return $methods;
        });
    }

    public function form(): array
    {
        return [
            'url' => [
                'label' => '支付网关地址',
                'type' => 'string',
                'required' => true,
                'description' => '请填写完整的支付网关地址，包括协议（http或https）'
            ],
            'pid' => [
                'label' => '商户ID',
                'type' => 'string',
                'description' => '请填写商户ID',
                'required' => true
            ],
            'key' => [
                'label' => '通信密钥',
                'type' => 'string',
                'required' => true,
                'description' => '请填写通信密钥'
            ],
            'type' => [
                'label' => '支付类型',
                'type' => 'string',
                'description' => '支付类型，如: alipay, wxpay, qqpay 等，可自定义'
            ],
        ];
    }

    public function pay($order): array
    {
        $params = [
            'money' => $order['total_amount'] / 100,
            'name' => $order['trade_no'],
            'notify_url' => $order['notify_url'],
            'return_url' => $order['return_url'],
            'out_trade_no' => $order['trade_no'],
            'pid' => $this->getConfig('pid')
        ];

        if ($paymentType = $this->getConfig('type')) {
            $params['type'] = $paymentType;
        }

        ksort($params);
        $str = stripslashes(urldecode(http_build_query($params))) . $this->getConfig('key');
        $params['sign'] = md5($str);
        $params['sign_type'] = 'MD5';

        return [
            'type' => 1,
            'data' => $this->getConfig('url') . '/submit.php?' . http_build_query($params)
        ];
    }

    public function notify($params): array|bool
    {
        if (!is_array($params)) {
            return false;
        }
        foreach ($params as $value) {
            if (!is_string($value) && !is_int($value)) {
                return false;
            }
        }
        foreach (['sign', 'pid', 'trade_status', 'out_trade_no', 'trade_no', 'money'] as $field) {
            if (!isset($params[$field]) || (string) $params[$field] === '') {
                return false;
            }
        }
        if (!is_string($params['sign']) || !preg_match('/\A[0-9a-fA-F]{32}\z/', $params['sign'])) {
            return false;
        }
        if (isset($params['sign_type']) && $params['sign_type'] !== 'MD5') {
            return false;
        }
        if ($params['trade_status'] !== 'TRADE_SUCCESS' ||
            (string) $params['pid'] !== (string) $this->getConfig('pid') ||
            !$this->getConfig('key')) {
            return false;
        }
        // Convert decimal currency to cents without rounding untrusted input.
        if (!preg_match('/\A(\d{1,10})(?:\.(\d{1,2}))?\z/', (string) $params['money'], $amount)) {
            return false;
        }
        $totalAmount = (int) $amount[1] * 100 + (int) str_pad($amount[2] ?? '', 2, '0');
        if ($totalAmount <= 0) {
            return false;
        }

        $sign = $params['sign'];
        unset($params['sign'], $params['sign_type']);
        ksort($params);
        $str = stripslashes(urldecode(http_build_query($params))) . $this->getConfig('key');

        if (!hash_equals(md5($str), strtolower($sign))) {
            return false;
        }

        return [
            'trade_no' => (string) $params['out_trade_no'],
            'callback_no' => (string) $params['trade_no'],
            'total_amount' => $totalAmount,
        ];
    }
}
