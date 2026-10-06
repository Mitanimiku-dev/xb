<?php

namespace Tests\Security;

use App\Support\Setting;
use Illuminate\Cache\CacheServiceProvider;
use Illuminate\Config\Repository as ConfigRepository;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Contracts\Routing\ResponseFactory;
use Illuminate\Contracts\Translation\Translator as TranslatorContract;
use Illuminate\Contracts\Validation\Factory as ValidationFactoryContract;
use Illuminate\Database\DatabaseServiceProvider;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Application;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Facade;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\Factory as ValidatorFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

abstract class IsolatedTestCase extends TestCase
{
    protected Application $app;

    protected function setUp(): void
    {
        parent::setUp();

        Facade::clearResolvedInstances();

        $this->app = new Application(dirname(__DIR__, 2));
        Facade::setFacadeApplication($this->app);

        $this->app->instance('config', new ConfigRepository([
            'app' => [
                'key' => 'base64:' . base64_encode(str_repeat('t', 32)),
                'locale' => 'en',
                'fallback_locale' => 'en',
                'timezone' => 'UTC',
            ],
            'database' => [
                'default' => 'testing',
                'connections' => [
                    'testing' => [
                        'driver' => 'sqlite',
                        'database' => ':memory:',
                        'prefix' => '',
                        'foreign_key_constraints' => true,
                    ],
                ],
            ],
            'cache' => [
                'default' => 'array',
                'stores' => [
                    'array' => ['driver' => 'array', 'serialize' => false],
                    'redis' => ['driver' => 'array', 'serialize' => false],
                ],
                'prefix' => 'security-test',
            ],
        ]));

        $this->app->register(DatabaseServiceProvider::class);
        $this->app->register(CacheServiceProvider::class);

        $translator = new Translator(new ArrayLoader(), 'en');
        $validator = new ValidatorFactory($translator, $this->app);
        $this->app->instance('translator', $translator);
        $this->app->instance(TranslatorContract::class, $translator);
        $this->app->instance('validator', $validator);
        $this->app->instance(ValidationFactoryContract::class, $validator);

        $responseFactory = $this->createMock(ResponseFactory::class);
        $responseFactory->method('json')->willReturnCallback(
            static fn ($data = [], int $status = 200, array $headers = [], int $options = 0) =>
                new JsonResponse($data, $status, $headers, $options)
        );
        $this->app->instance(ResponseFactory::class, $responseFactory);

        $logger = new NullLogger();
        $this->app->instance('log', $logger);
        $this->app->instance(LoggerInterface::class, $logger);

        $dispatcher = $this->createMock(Dispatcher::class);
        $dispatcher->method('dispatchSync')->willReturnCallback(static function ($job) {
            $job->handle();
            return null;
        });
        $this->app->instance(Dispatcher::class, $dispatcher);

        Request::macro('validate', function (array $rules, ...$params) {
            return app('validator')->make($this->all(), $rules, $params[0] ?? [])->validate();
        });

        Model::setConnectionResolver($this->app->make('db'));
        Model::unsetEventDispatcher();

        $this->createSchema();
        $this->app->singleton(Setting::class);
        Cache::store('redis')->forever(Setting::CACHE_KEY, []);
    }

    protected function tearDown(): void
    {
        Request::flushMacros();
        Model::unsetConnectionResolver();
        $this->app->make('db')->disconnect('testing');
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication(null);

        parent::tearDown();
    }

    private function createSchema(): void
    {
        $schema = $this->app->make('db')->connection()->getSchemaBuilder();

        $schema->create('v2_plan', function ($table) {
            $table->increments('id');
            $table->string('name');
            $table->unsignedInteger('group_id')->nullable();
            $table->unsignedBigInteger('transfer_enable')->default(0);
            $table->unsignedInteger('speed_limit')->nullable();
            $table->unsignedInteger('device_limit')->nullable();
            $table->boolean('show')->default(true);
            $table->boolean('sell')->default(true);
            $table->boolean('renew')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->text('prices')->nullable();
            $table->integer('reset_traffic_method')->nullable();
            $table->unsignedInteger('capacity_limit')->nullable();
            $table->integer('created_at')->nullable();
            $table->integer('updated_at')->nullable();
        });

        $schema->create('v2_user', function ($table) {
            $table->increments('id');
            $table->string('email');
            $table->string('password')->default('password');
            $table->unsignedInteger('plan_id')->nullable();
            $table->unsignedInteger('group_id')->nullable();
            $table->unsignedBigInteger('transfer_enable')->default(0);
            $table->unsignedBigInteger('u')->default(0);
            $table->unsignedBigInteger('d')->default(0);
            $table->unsignedInteger('speed_limit')->nullable();
            $table->unsignedInteger('device_limit')->nullable();
            $table->integer('expired_at')->nullable();
            $table->boolean('banned')->default(false);
            $table->integer('balance')->default(0);
            $table->unsignedInteger('discount')->nullable();
            $table->unsignedInteger('invite_user_id')->nullable();
            $table->unsignedInteger('commission_type')->default(0);
            $table->decimal('commission_rate', 8, 2)->default(0);
            $table->integer('created_at')->nullable();
            $table->integer('updated_at')->nullable();
        });

        $schema->create('v2_order', function ($table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('plan_id');
            $table->unsignedInteger('payment_id')->nullable();
            $table->string('period');
            $table->string('trade_no')->unique();
            $table->integer('total_amount')->default(0);
            $table->integer('handling_amount')->default(0);
            $table->integer('discount_amount')->default(0);
            $table->integer('balance_amount')->default(0);
            $table->integer('refund_amount')->default(0);
            $table->integer('surplus_amount')->default(0);
            $table->text('surplus_order_ids')->nullable();
            $table->unsignedInteger('invite_user_id')->nullable();
            $table->integer('commission_balance')->default(0);
            $table->unsignedInteger('type')->default(1);
            $table->unsignedInteger('status')->default(0);
            $table->integer('paid_at')->nullable();
            $table->string('callback_no')->nullable();
            $table->integer('created_at')->nullable();
            $table->integer('updated_at')->nullable();
        });

        $schema->create('v2_payment', function ($table) {
            $table->increments('id');
            $table->string('payment');
            $table->string('uuid')->unique();
            $table->text('config')->nullable();
            $table->boolean('enable')->default(true);
            $table->string('notify_domain')->nullable();
            $table->integer('created_at')->nullable();
            $table->integer('updated_at')->nullable();
        });

        $schema->create('v2_settings', function ($table) {
            $table->increments('id');
            $table->string('name')->unique();
            $table->text('value')->nullable();
            $table->integer('created_at')->nullable();
            $table->integer('updated_at')->nullable();
        });

        $schema->create('custom_traffic_orders', function ($table) {
            $table->increments('id');
            $table->unsignedInteger('order_id');
            $table->unsignedInteger('plan_id');
            $table->unsignedInteger('user_id');
            $table->string('period');
            $table->unsignedInteger('traffic_gb');
            $table->integer('monthly_price');
            $table->integer('amount');
            $table->timestamps();
        });
    }
}
