import { mountRegistration } from './landing.js?v=auth-transition-2';

export function installRegistrationRoute(theme) {
  const router = theme.R;
  const createVNode = theme.b;
  const preparedPages = new WeakMap();
  let preload;

  function registrationParams(route) {
    const params = new URLSearchParams(location.search);
    new URL(route.fullPath, location.origin).searchParams.forEach((value, key) => params.set(key, value));
    return params;
  }

  async function fetchRegistration(params, signal) {
    const endpoint = new URL('/custom-traffic/plan9', location.origin);
    const pending = params.get('plan_token');
    if (pending) endpoint.searchParams.set('plan_token', pending);
    const response = await fetch(endpoint, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('Registration page request failed');
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const config = JSON.parse(page.getElementById('__ct-config').textContent);
    const stylesheet = page.querySelector('link[rel="stylesheet"]');
    const cssResponse = await fetch(new URL(stylesheet.getAttribute('href'), location.origin), { signal });
    if (!cssResponse.ok) throw new Error('Registration stylesheet request failed');
    return { page, config, css: await cssResponse.text() };
  }

  function prepareRegistration(route) {
    const params = registrationParams(route);
    // Pending selections remain private to their URL; only the default form is prefetched.
    if (params.has('plan_token')) return fetchRegistration(params);
    if (!preload || Date.now() - preload.createdAt > 30000) {
      const entry = { createdAt: Date.now() };
      entry.promise = fetchRegistration(params).catch(error => {
        if (preload === entry) preload = null;
        throw error;
      });
      preload = entry;
    }
    return preload.promise;
  }

  const component = {
    name: 'CustomTrafficRegistration',
    props: ['definition', 'params'],
    render() {
      return createVNode('div', {
        ref: 'host',
        'data-ct-shared-background': '',
        style: { display: 'block', minHeight: '100vh' }
      });
    },
    mounted() {
      this.registrationRoot = this.$refs.host.attachShadow({ mode: 'open' });
      this.registrationClick = event => {
        const link = event.target.closest?.('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey || (link.target && link.target !== '_self')) return;
        const url = new URL(link.href);
        if (url.origin !== location.origin || url.pathname !== '/') return;
        event.preventDefault();
        router.push(url.hash.slice(1) || '/');
      };
      this.registrationRoot.addEventListener('click', this.registrationClick);
      this.renderRegistration();
    },
    watch: {
      params() {
        this.renderRegistration();
      }
    },
    beforeUnmount() {
      this.registrationAbort?.abort();
      this.registrationDispose?.();
      this.registrationRoot.removeEventListener('click', this.registrationClick);
    },
    methods: {
      renderRegistration(definition = this.definition) {
        if (!this.registrationRoot) return;
        this.registrationDispose?.();
        this.registrationDispose = null;
        const root = this.registrationRoot;
        if (!definition || definition.error) {
          const message = document.createElement('p');
          message.setAttribute('role', 'alert');
          message.style.cssText = 'margin:0;padding:48px 24px 16px;text-align:center';
          message.textContent = '\u6ce8\u518c\u9875\u52a0\u8f7d\u5931\u8d25';
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.textContent = '\u91cd\u8bd5';
          retry.style.cssText = 'display:block;margin:16px auto;padding:8px 20px;cursor:pointer';
          retry.addEventListener('click', () => this.retryRegistration(retry));
          root.replaceChildren(message, retry);
          return;
        }
        const { page, config, css } = definition;
        const style = document.createElement('style');
        style.textContent = css;
        const body = document.createElement('div');
        body.className = 'ct-register-body';
        for (const child of page.body.children) {
          if (child.tagName !== 'SCRIPT') body.appendChild(document.importNode(child, true));
        }
        root.replaceChildren(style, body);
        const app = theme.u();
        this.registrationDispose = mountRegistration(root, config, {
          params: this.params,
          theme: {
            isDark: () => app.isDark,
            toggle: () => app.toggleDark(),
            subscribe: callback => theme.bF(() => app.isDark, callback, { flush: 'post' })
          },
          navigate: path => {
            const url = new URL(path, location.origin);
            return router.push(url.hash.slice(1) || '/');
          }
        });
        document.title = page.title;
      },
      async retryRegistration(button) {
        this.registrationAbort?.abort();
        const controller = new AbortController();
        this.registrationAbort = controller;
        button.disabled = true;
        window.$loadingBar?.start();
        try {
          const definition = await fetchRegistration(this.params, controller.signal);
          if (!controller.signal.aborted) this.renderRegistration(definition);
        } catch (error) {
          if (!controller.signal.aborted) button.disabled = false;
        } finally {
          window.$loadingBar?.finish();
        }
      }
    }
  };

  const authNames = ['login', 'register', 'forgetpassword'];
  const originalRoutes = router.getRoutes().filter(route => authNames.includes(route.name));
  authNames.forEach(name => router.removeRoute(name));
  router.addRoute({
    name: 'custom-traffic-auth',
    path: '/_auth',
    component: {
      name: 'AuthPageTransition',
      render() {
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Reuse LiquidGlass's existing background classes and scoped animation.
        const background = createVNode('div', {
          class: 'ct-auth-background bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800',
          'aria-hidden': 'true',
          style: theme.u().background_url ? {
            background: `url(${JSON.stringify(theme.u().background_url)}) no-repeat center / cover`
          } : undefined
        }, [
          'absolute -top-24 -left-24 w-96 h-96 bg-gradient-to-br from-slate-100 to-gray-100 dark:from-slate-800 dark:to-gray-800 rounded-full opacity-50 blur-3xl',
          'absolute -bottom-32 -right-32 w-80 h-80 bg-gradient-to-br from-gray-100 to-slate-200 dark:from-gray-800 dark:to-slate-700 rounded-full opacity-50 blur-3xl',
          'absolute top-1/3 right-1/4 w-64 h-64 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-800 dark:to-gray-800 rounded-full opacity-30 blur-2xl'
        ].map(className => createVNode('div', { class: className, 'data-v-6ab58db6': '' })));
        const view = createVNode(theme.z('RouterView'), null, {
          default: ({ Component, route }) => createVNode(theme.cq, {
            name: 'page',
            mode: reducedMotion ? undefined : 'out-in',
            css: !reducedMotion,
            onBeforeEnter: element => {
              const scroller = element.closest('.modern-app-provider');
              if (scroller) scroller.scrollTop = 0;
            }
          }, {
            default: () => Component ? createVNode('div', {
              key: route.path,
              'data-ct-auth-page': route.name
            }, [Component]) : null
          })
        });
        return createVNode('div', { class: 'ct-auth-layout' }, [background, view]);
      }
    },
    children: originalRoutes.map(route => route.name === 'register' ? {
      name: 'register',
      path: '/register',
      component,
      props: to => preparedPages.get(to) || { definition: { error: true }, params: registrationParams(to) },
      meta: { isHidden: true },
      beforeEnter: () => theme.M().userUUID ? '/plan/9' : undefined
    } : {
      name: route.name,
      path: route.path,
      component: route.components.default,
      meta: route.meta
    })
  });
  router.beforeResolve(async to => {
    if (to.name !== 'register') return;
    try {
      const definition = await prepareRegistration(to);
      preparedPages.set(to, { definition, params: registrationParams(to) });
    } catch (error) {
      preparedPages.set(to, { definition: { error: true }, params: registrationParams(to) });
    }
  });
  router.afterEach((to, from, failure) => {
    if (!failure && to.name === 'login') prepareRegistration({ fullPath: '/register' }).catch(() => {});
  });
}
