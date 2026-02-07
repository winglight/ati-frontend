import "./test-setup.mjs";
import { jsx as _jsx } from "react/jsx-runtime";
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarketDataModal from '../.tests-dist/components/modals/MarketDataModal.js';
import strategiesReducer, { setMarketDataSubscriptions, setMarketDataSubscriptionsStatus } from '../.tests-dist/store/slices/strategiesSlice.js';
const originalDateNow = Date.now;
const fixedTestNow = new Date('2023-01-02T10:20:00Z').getTime();
Date.now = () => fixedTestNow;
const fetchCalls = [];
let directoryResponseSymbols = [];
let directoryResponseIntervals = [];
let directoryPreferredSymbol = null;
let shouldFailRefreshRequest = false;
const initialSymbolRangeResponse = {
    entries: [
        {
            symbol: 'ES',
            data_type: 'bar_1m',
            start: '2023-01-01T00:00:00Z',
            end: '2023-01-01T01:00:00Z',
            total_size: 4096,
            metadata: { updated_at: '2023-01-02T01:00:00Z' }
        },
        {
            symbol: 'ES',
            data_type: 'dom_depth',
            path: '/cache/dom/ES/20230101T010000Z-20230101T013000Z.parquet',
            size_bytes: 8192,
            metadata: { lastModified: '2023-01-02T02:00:00Z' }
        }
    ],
    last_refreshed: '2023-01-02T03:00:00Z'
};
const refreshedSymbolRangeResponse = {
    entries: [
        {
            symbol: 'ES',
            data_type: 'bar_1m',
            start: '2023-01-01T00:00:00Z',
            end: '2023-01-01T02:00:00Z',
            total_size: 8192,
            metadata: { updated_at: '2023-01-02T04:00:00Z' }
        },
        {
            symbol: 'ES',
            data_type: 'dom_depth',
            path: '/cache/dom/ES/20230101T020000Z-20230101T023000Z.parquet',
            size_bytes: 16384,
            metadata: { lastModified: '2023-01-02T05:00:00Z' }
        }
    ],
    last_refreshed: '2023-01-02T05:30:00Z'
};
let symbolRangeResponse = initialSymbolRangeResponse;
const mockDirectorySymbols = ['ES'];
const mockDirectoryIntervals = ['1m'];
const refreshedDirectorySymbols = ['CL'];
const refreshedDirectoryIntervals = ['1m'];
const fallbackDirectorySymbols = ['NQ'];
const fallbackDirectoryIntervals = ['5m'];
directoryResponseSymbols = mockDirectorySymbols;
directoryResponseIntervals = mockDirectoryIntervals;
const createJsonResponse = (payload) => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
});
const clone = (value) => JSON.parse(JSON.stringify(value));
const baseStrategiesState = strategiesReducer(undefined, { type: '@@INIT' });
const createStore = (overrides) => {
    const authState = (overrides?.auth ?? { token: 'test-token' });
    const marketState = (overrides?.market ?? {
        symbols: [
            {
                symbol: 'ES',
                secType: 'FUT',
                exchange: 'CME',
                currency: 'USD',
                name: 'E-mini S&P'
            }
        ]
    });
    const strategiesState = clone({
        ...baseStrategiesState,
        ...(overrides?.strategies ?? {})
    });
    const authReducer = (state = authState) => state;
    const marketReducer = (state = marketState) => state;
    return configureStore({
        reducer: {
            auth: authReducer,
            market: marketReducer,
            strategies: strategiesReducer
        },
        preloadedState: {
            auth: authState,
            market: marketState,
            strategies: strategiesState
        }
    });
};
globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : '';
    fetchCalls.push({ url, init });
    if (url.includes('/data/market/catalog/refresh')) {
        if (shouldFailRefreshRequest) {
            return {
                ok: false,
                status: 500,
                json: async () => ({}),
                text: async () => '{}'
            };
        }
        return createJsonResponse({
            symbols: refreshedDirectorySymbols,
            intervals: refreshedDirectoryIntervals,
            preferred_symbol: 'CL'
        });
    }
    if (url.includes('/data/market/catalog/quick-scan')) {
        if (typeof init?.body === 'string' && init.body.includes('"refresh":true')) {
            symbolRangeResponse = clone(refreshedSymbolRangeResponse);
        }
        return createJsonResponse(clone(symbolRangeResponse));
    }
    if (url.includes('/data/market/catalog')) {
        const payload = {
            symbols: directoryResponseSymbols,
            intervals: directoryResponseIntervals
        };
        if (directoryPreferredSymbol) {
            payload.preferred_symbol = directoryPreferredSymbol;
        }
        return createJsonResponse(payload);
    }
    if (url.includes('/data/market/backfill/history')) {
        return createJsonResponse({
            command: 'python scripts/data/run_backfill.py --direct-ib --ib-host 127.0.0.1 --ib-port 4001 --symbol ES --timeframe bar_1m --start 2022-01-01T00:00:00Z --end 2023-01-01T23:59:59Z --ib-client-id 105 --ib-client-id-fallbacks 106,107,108,109,110 --ib-historical-timeout 180 --ib-request-pause 10 --ib-sub-span-days 3 --ib-retry-attempts 5 --ib-retry-delay 10 --ib-retry-backoff 2 --skip-if-cached --max-span-days 7',
            pid: 4321,
            script: 'scripts/data/run_backfill.py',
            run_backfill: 'run_backfill',
            started: true
        });
    }
    return createJsonResponse({});
};
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};
const clickCoverageTab = async (user) => {
    const coverageTab = (await waitFor(() => {
        const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('覆盖统计'));
        if (!button) {
            throw new Error('Coverage tab should exist');
        }
        return button;
    }));
    await user.click(coverageTab);
};
await (async () => {
    fetchCalls.length = 0;
    directoryResponseSymbols = mockDirectorySymbols;
    directoryResponseIntervals = mockDirectoryIntervals;
    directoryPreferredSymbol = null;
    shouldFailRefreshRequest = false;
    symbolRangeResponse = clone(initialSymbolRangeResponse);
    const store = createStore();
    const renderResult = render(_jsx(Provider, { store: store, children: _jsx(MarketDataModal, { open: true, onClose: () => undefined }) }));
    const user = userEvent.setup({ document: window.document });
    await clickCoverageTab(user);
    let initialLastRefreshedText = '';
    await waitFor(() => {
        const refreshValue = document.querySelector('.refreshValue');
        if (!refreshValue || !refreshValue.textContent || refreshValue.textContent.trim() === '—') {
            throw new Error('Coverage refresh timestamp should be visible');
        }
        initialLastRefreshedText = refreshValue.textContent.trim();
    });
    const symbolButton = (await waitFor(() => {
        const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === 'ES');
        if (!button) {
            throw new Error('Symbol node should render in coverage tree');
        }
        return button;
    }));
    await user.click(symbolButton);
    await waitFor(() => {
        const trigger = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('Backfill'));
        if (!trigger) {
            throw new Error('Backfill button should be rendered');
        }
        if (trigger.disabled) {
            throw new Error('Backfill button should become enabled after selection');
        }
    });
    const backfillButton = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('Backfill'));
    assert(backfillButton, 'Backfill button should exist before opening confirmation');
    await user.click(backfillButton);
    const clientIdInput = (await waitFor(() => {
        const input = document.querySelector('input[type="number"]');
        if (!input) {
            throw new Error('ib-client-id input should be present in confirmation modal');
        }
        return input;
    }));
    const dateInputs = Array.from(document.querySelectorAll('input[type="date"]'));
    if (dateInputs.length < 2) {
        throw new Error('Start and end date inputs should be present in confirmation modal');
    }
    const [startInput, endInput] = dateInputs;
    fireEvent.change(clientIdInput, { target: { value: '105' } });
    fireEvent.change(startInput, { target: { value: '2022-01-01' } });
    fireEvent.change(endInput, { target: { value: '2023-01-01' } });
    const confirmButton = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('确认'));
    assert(confirmButton, 'Confirmation button should exist');
    fireEvent.click(confirmButton);
    await waitFor(() => {
        const backfillCall = fetchCalls.find((call) => call.url.includes('/data/market/backfill/history'));
        if (!backfillCall) {
            throw new Error('Backfill request was not dispatched');
        }
        const body = backfillCall.init?.body ?? null;
        assert(typeof body === 'string', 'Backfill request body should be JSON encoded');
        const parsed = JSON.parse(body);
        if (parsed.timeframe !== 'bar_1m') {
            throw new Error(`Expected timeframe bar_1m, received ${String(parsed.timeframe)}`);
        }
        if (parsed.ib_client_id !== 105) {
            throw new Error(`Expected ib_client_id 105, received ${String(parsed.ib_client_id)}`);
        }
        const fallbacks = parsed.ib_client_id_fallbacks;
        if (!Array.isArray(fallbacks) || fallbacks.join(',') !== '106,107,108,109,110') {
            throw new Error(`Expected ib_client_id_fallbacks 106-110, received ${String(fallbacks)}`);
        }
        if (parsed.start !== '2022-01-01T00:00:00Z' || parsed.end !== '2023-01-01T23:59:59Z') {
            throw new Error('Expected ISO date range to be sent to backend');
        }
    });
    await waitFor(() => {
        const command = document.querySelector('[data-testid="backfill-command"]');
        if (!command || !command.textContent?.includes('scripts/data/run_backfill.py')) {
            throw new Error('Command preview should render run_backfill script path');
        }
    });
    renderResult.unmount();
    await cleanup();
})();
console.log('MarketDataModal backfill command interaction test passed');
await (async () => {
    fetchCalls.length = 0;
    directoryResponseSymbols = mockDirectorySymbols;
    directoryResponseIntervals = mockDirectoryIntervals;
    directoryPreferredSymbol = null;
    shouldFailRefreshRequest = false;
    symbolRangeResponse = clone(initialSymbolRangeResponse);
    const store = createStore();
    store.dispatch(setMarketDataSubscriptionsStatus({ status: 'updating' }));
    const renderResult = render(_jsx(Provider, { store: store, children: _jsx(MarketDataModal, { open: true, onClose: () => undefined }) }));
    const user = userEvent.setup({ document: window.document });
    const subscriptionsTab = (await waitFor(() => {
        const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('实时订阅'));
        if (!button) {
            throw new Error('Subscriptions tab button should exist');
        }
        return button;
    }));
    await user.click(subscriptionsTab);
    await waitFor(() => {
        const loading = document.querySelector('[data-testid="market-data-subs-loading"]');
        if (!loading) {
            throw new Error('Loading indicator should render while status is updating');
        }
    });
    store.dispatch(setMarketDataSubscriptionsStatus({ status: 'idle', error: null }));
    await waitFor(() => {
        const empty = document.querySelector('[data-testid="market-data-subs-empty"]');
        if (!empty) {
            throw new Error('Empty state should display when no subscriptions are present');
        }
    });
    store.dispatch(setMarketDataSubscriptionsStatus({ status: 'idle', error: '同步失败' }));
    await waitFor(() => {
        const errorBanner = document.querySelector('[data-testid="market-data-subs-error"]');
        if (!errorBanner || !errorBanner.textContent?.includes('同步失败')) {
            throw new Error('Error banner should surface subscription errors from the store');
        }
    });
    const sampleSubscriptions = [
        {
            subscriptionId: 'sub-dom',
            symbol: 'ES',
            secType: 'FUT',
            metadata: { source: 'order_book' },
            streams: [
                {
                    subscriptionId: 'sub-dom',
                    streamType: 'dom',
                    enabled: true,
                    ownerCount: 1,
                    totalReferences: 2,
                    metadata: { channel: 'depth' },
                    requestId: 'req-dom-1',
                    subscribers: [
                        {
                            ownerId: 'ws:client-1',
                            referenceCount: 2,
                            metadata: { origin: 'alpha' },
                            name: 'Strategy Alpha',
                            subscribedAt: '2023-01-02T08:00:00Z',
                            pushedAt: '2023-01-02T10:19:40Z'
                        }
                    ]
                }
            ],
            ownerCount: 1,
            owners: ['ws:client-1']
        },
        {
            subscriptionId: 'sub-bars',
            symbol: 'ES',
            secType: 'FUT',
            streams: [
                {
                    subscriptionId: 'sub-bars',
                    streamType: 'bars',
                    enabled: true,
                    ownerCount: 0,
                    totalReferences: null,
                    requestId: 'req-bars-1',
                    subscribers: []
                }
            ],
            ownerCount: 0,
            owners: []
        },
        {
            subscriptionId: 'sub-ticker',
            symbol: 'AAPL',
            secType: 'STK',
            streams: [
                {
                    subscriptionId: 'sub-ticker',
                    streamType: 'ticker',
                    enabled: true,
                    ownerCount: 2,
                    totalReferences: 2,
                    subscribers: [
                        {
                            ownerId: 'ws:client-2',
                            referenceCount: 1,
                            name: 'Scanner',
                            subscribedAt: '1672646400000',
                            pushedAt: '2023-01-02T09:40:00Z'
                        },
                        { ownerId: 'ws:client-3', referenceCount: 1 }
                    ]
                }
            ],
            ownerCount: 2,
            owners: ['ws:client-2', 'ws:client-3']
        }
    ];
    store.dispatch(setMarketDataSubscriptions({
        items: sampleSubscriptions,
        updatedAt: '2023-01-02T08:00:00Z',
        telemetry: { source: 'ws-feed', sequence: 42 },
        error: null
    }));
    store.dispatch(setMarketDataSubscriptionsStatus({ status: 'idle', error: null }));
    await waitFor(() => {
        const errorBanner = document.querySelector('[data-testid="market-data-subs-error"]');
        if (errorBanner) {
            throw new Error('Error banner should disappear once the error is cleared');
        }
        const summary = document.querySelector('[data-testid="market-data-subs-summary"]');
        if (!summary || !summary.textContent?.includes('DOM 1') || !summary.textContent.includes('Bars 1')) {
            throw new Error('Summary text should reflect subscription counts');
        }
        const source = document.querySelector('[data-testid="market-data-subs-source"]');
        if (!source || !source.textContent?.includes('ws-feed')) {
            throw new Error('Telemetry source should display the feed origin');
        }
        const statusText = document.querySelector('[data-testid="market-data-subs-status"]');
        if (!statusText || !statusText.textContent?.includes('已同步')) {
            throw new Error('Status indicator should show idle state after synchronization');
        }
    });
    await waitFor(() => {
        const rows = document.querySelectorAll('[data-testid="market-data-subs-row"]');
        if (rows.length !== 4) {
            throw new Error('Expected subscription rows for each stream subscriber');
        }
        // Find the row containing Strategy Alpha (should be the ES/dom row)
        const strategyAlphaRow = Array.from(rows).find(row => row.textContent?.includes('Strategy Alpha'));
        if (!strategyAlphaRow) {
            throw new Error('Subscriber display should include the provided name "Strategy Alpha"');
        }
        if (!strategyAlphaRow.textContent?.includes('req-dom-1')) {
            throw new Error('Stream request identifier should be visible in the listing');
        }
        if (!strategyAlphaRow.textContent?.includes('小时')) {
            throw new Error('Subscriber subscription time should be displayed as a relative duration');
        }
        if (!strategyAlphaRow.textContent?.includes('秒前')) {
            throw new Error('Latest push timestamp should render as a relative duration');
        }
        const scannerRow = Array.from(rows).find((row) => row.textContent?.includes('Scanner'));
        if (!scannerRow) {
            throw new Error('Ticker subscriber row should be rendered for Scanner');
        }
        if (!scannerRow.textContent?.includes('10 小时前')) {
            throw new Error('Ticker subscriber subscribedAt timestamp should render as relative hours');
        }
        if (!scannerRow.textContent?.includes('40 分钟前')) {
            throw new Error('Ticker subscriber pushedAt timestamp should render as relative minutes');
        }
        const empty = document.querySelector('[data-testid="market-data-subs-empty"]');
        if (empty) {
            throw new Error('Empty state should be hidden once subscriptions are available');
        }
        const stopButton = Array.from(document.querySelectorAll('button')).find((element) => element.textContent === '取消订阅');
        if (!stopButton) {
            throw new Error('Stop button should be available for active subscriptions');
        }
    });
    renderResult.unmount();
    await cleanup();
})();
console.log('MarketDataModal subscriptions state test passed');
await (async () => {
    const store = createStore();
    const renderResult = render(_jsx(Provider, { store: store, children: _jsx(MarketDataModal, { open: true, onClose: () => undefined }) }));
    const user = userEvent.setup({ document: window.document });
    const subscriptionsTab = (await waitFor(() => {
        const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('实时订阅'));
        if (!button) {
            throw new Error('Subscriptions tab button should exist for dedup test');
        }
        return button;
    }));
    await user.click(subscriptionsTab);
    const sharedOwnerSubscriptions = [
        {
            subscriptionId: 'shared-owner-sub',
            symbol: 'ES',
            secType: 'FUT',
            streams: [
                {
                    subscriptionId: 'shared-owner-sub',
                    streamType: 'dom',
                    enabled: true,
                    ownerCount: 1,
                    totalReferences: 2,
                    requestId: 'req-shared',
                    subscribers: [
                        {
                            ownerId: 'ws:owner-duplicate',
                            referenceCount: 1,
                            source: 'strategy-service',
                            name: 'Dom1',
                            subscribedAt: '2023-01-02T10:00:00Z',
                            pushedAt: '2023-01-02T10:18:00Z'
                        },
                        {
                            ownerId: 'ws:owner-duplicate',
                            referenceCount: 1,
                            source: 'momentum-service',
                            name: 'Momentum5',
                            subscribedAt: '2023-01-02T10:05:00Z',
                            pushedAt: '2023-01-02T10:17:00Z'
                        }
                    ]
                }
            ],
            ownerCount: 1,
            owners: ['ws:owner-duplicate']
        }
    ];
    store.dispatch(setMarketDataSubscriptions({
        items: sharedOwnerSubscriptions,
        updatedAt: '2023-01-02T10:10:00Z',
        telemetry: { source: 'ws-feed' },
        error: null
    }));
    store.dispatch(setMarketDataSubscriptionsStatus({ status: 'idle', error: null }));
    await waitFor(() => {
        const rows = Array.from(document.querySelectorAll('[data-testid="market-data-subs-row"]'));
        if (rows.length !== 2) {
            throw new Error('Subscribers with different sources should render two distinct rows');
        }
        const rowTexts = rows.map((row) => row.textContent ?? '');
        if (!rowTexts.some((text) => text.includes('strategy-service') && text.includes('Dom1'))) {
            throw new Error('First subscriber row should display the strategy-service source and Dom1 label');
        }
        if (!rowTexts.some((text) => text.includes('momentum-service') && text.includes('Momentum5'))) {
            throw new Error('Second subscriber row should display the momentum-service source and Momentum5 label');
        }
    });
    renderResult.unmount();
    await cleanup();
})();
console.log('MarketDataModal shared owner subscriber test passed');
await (async () => {
    const store = createStore();
    const renderResult = render(_jsx(Provider, { store: store, children: _jsx(MarketDataModal, { open: true, onClose: () => undefined }) }));
    const user = userEvent.setup({ document: window.document });
    const subscriptionsTab = await waitFor(() => {
        const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('实时订阅'));
        if (!button) {
            throw new Error('Subscriptions tab button should be available');
        }
        return button;
    });
    await user.click(subscriptionsTab);
    const toggle = await waitFor(() => {
        const element = document.querySelector('[data-testid="market-data-streaming-toggle"]');
        if (!element) {
            throw new Error('Streaming toggle button should render inside the subscriptions tab');
        }
        return element;
    });
    if (!toggle.textContent?.includes('Streaming 模式')) {
        throw new Error('Streaming toggle should default to the streaming label');
    }
    await user.click(toggle);
    await waitFor(() => {
        if (!toggle.textContent?.includes('手动模式')) {
            throw new Error('Streaming toggle should reflect manual mode after clicking');
        }
    });
    await waitFor(() => {
        const manualBanner = document.querySelector('[data-testid="market-data-subs-manual-banner"]');
        if (!manualBanner) {
            throw new Error('Manual mode banner should appear when streaming is disabled');
        }
    });
    renderResult.unmount();
    await cleanup();
})();
console.log('MarketDataModal streaming toggle test passed');
await (async () => {
    fetchCalls.length = 0;
    directoryResponseSymbols = mockDirectorySymbols;
    directoryResponseIntervals = mockDirectoryIntervals;
    directoryPreferredSymbol = null;
    shouldFailRefreshRequest = false;
    symbolRangeResponse = clone(initialSymbolRangeResponse);
    const store = createStore();
    const renderResult = render(_jsx(Provider, { store: store, children: _jsx(MarketDataModal, { open: true, onClose: () => undefined }) }));
    const verboseStatus = 'Stream update: the upstream provider reported a transient spike in load that should recover shortly after automated retries are processed.';
    const normalizedVerboseStatus = verboseStatus.replace(/\s+/g, ' ').trim();
    store.dispatch(setMarketDataSubscriptions({
        items: [],
        updatedAt: '2023-01-02T09:00:00Z',
        telemetry: { status: verboseStatus },
        error: null
    }));
    store.dispatch(setMarketDataSubscriptionsStatus({ status: 'idle', error: null }));
    // Switch to subscriptions tab to see telemetry
    const user = userEvent.setup({ document: window.document });
    const subscriptionsTab = Array.from(document.querySelectorAll('button')).find((element) => element.textContent === '实时订阅');
    if (subscriptionsTab) {
        await user.click(subscriptionsTab);
    }
    await waitFor(() => {
        const source = document.querySelector('[data-testid="market-data-subs-source"]');
        if (!source || !source.textContent) {
            throw new Error('Telemetry label should render a fallback summary');
        }
        const content = source.textContent.trim();
        if (!content) {
            throw new Error('Telemetry label should not be empty when summary is available');
        }
        if (content.includes('{') || content.includes('}')) {
            throw new Error('Telemetry label should not render a JSON blob');
        }
        if (!content.endsWith('…')) {
            throw new Error('Telemetry label should truncate lengthy summaries with an ellipsis');
        }
        if (content.length > 80) {
            throw new Error('Telemetry label should be trimmed to a reasonable length');
        }
        const expectedPrefix = normalizedVerboseStatus.slice(0, 10);
        if (!content.startsWith(expectedPrefix)) {
            throw new Error('Telemetry label should begin with the normalized status message');
        }
    });
    renderResult.unmount();
    await cleanup();
})();
console.log('MarketDataModal telemetry summary fallback test passed');
await (async () => {
    fetchCalls.length = 0;
    directoryResponseSymbols = mockDirectorySymbols;
    directoryResponseIntervals = mockDirectoryIntervals;
    directoryPreferredSymbol = null;
    shouldFailRefreshRequest = false;
    symbolRangeResponse = clone(initialSymbolRangeResponse);
    const store = createStore();
    const renderResult = render(_jsx(Provider, { store: store, children: _jsx(MarketDataModal, { open: true, onClose: () => undefined }) }));
    const user = userEvent.setup({ document: window.document });
    await clickCoverageTab(user);
    await waitFor(() => {
        const select = document.getElementById('market-data-symbol');
        if (!select) {
            throw new Error('Symbol selector should be rendered');
        }
        if (select.value !== 'ES') {
            throw new Error('Initial symbol should be ES');
        }
    });
    const refreshButton = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('刷新目录'));
    if (!refreshButton) {
        throw new Error('Refresh button should exist');
    }
    await user.click(refreshButton);
    await waitFor(() => {
        const postCall = fetchCalls.find((call) => call.url.includes('/data/market/catalog/refresh'));
        if (!postCall) {
            throw new Error('Refresh request should be issued');
        }
        if ((postCall.init?.method ?? 'GET').toUpperCase() !== 'POST') {
            throw new Error('Refresh request should use POST method');
        }
    });
    await waitFor(() => {
        const select = document.getElementById('market-data-symbol');
        if (!select) {
            throw new Error('Symbol selector should remain rendered');
        }
        const options = Array.from(select.options).map((option) => option.value);
        if (!options.includes('CL')) {
            throw new Error('Refreshed directory options should include CL');
        }
        if (select.value !== 'CL') {
            throw new Error('Selected symbol should update to refreshed entry');
        }
    });
    renderResult.unmount();
    await cleanup();
})();
console.log('MarketDataModal directory refresh test passed');
await (async () => {
    fetchCalls.length = 0;
    directoryResponseSymbols = mockDirectorySymbols;
    directoryResponseIntervals = mockDirectoryIntervals;
    directoryPreferredSymbol = null;
    shouldFailRefreshRequest = true;
    symbolRangeResponse = clone(initialSymbolRangeResponse);
    const store = createStore();
    const renderResult = render(_jsx(Provider, { store: store, children: _jsx(MarketDataModal, { open: true, onClose: () => undefined }) }));
    const user = userEvent.setup({ document: window.document });
    await clickCoverageTab(user);
    const select = (await waitFor(() => {
        const element = document.getElementById('market-data-symbol');
        if (!element) {
            throw new Error('Symbol selector should be rendered');
        }
        return element;
    }));
    if (select.value !== 'ES') {
        throw new Error('Initial symbol should be ES');
    }
    directoryResponseSymbols = fallbackDirectorySymbols;
    directoryResponseIntervals = fallbackDirectoryIntervals;
    directoryPreferredSymbol = 'NQ';
    const refreshButton = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes('刷新目录'));
    if (!refreshButton) {
        throw new Error('Refresh button should exist');
    }
    const initialDirectoryCalls = fetchCalls.filter((call) => call.url.includes('/data/market/catalog')).length;
    await user.click(refreshButton);
    await waitFor(() => {
        const refreshIndex = fetchCalls.findIndex((call) => call.url.includes('/data/market/catalog/refresh'));
        if (refreshIndex === -1) {
            throw new Error('Refresh request should be issued');
        }
        const fallbackCall = fetchCalls.find((call, index) => index > refreshIndex &&
            call.url.includes('/data/market/catalog') &&
            (call.init?.method ?? 'GET').toUpperCase() === 'GET');
        if (!fallbackCall) {
            throw new Error('Fallback directory request should follow failed refresh');
        }
        const directoryCalls = fetchCalls.filter((call) => call.url.includes('/data/market/catalog')).length;
        if (directoryCalls <= initialDirectoryCalls) {
            throw new Error('Fallback directory request count should increase');
        }
    });
    await waitFor(() => {
        const symbolSelect = document.getElementById('market-data-symbol');
        if (!symbolSelect) {
            throw new Error('Symbol selector should remain rendered after fallback');
        }
        const options = Array.from(symbolSelect.options).map((option) => option.value);
        if (!options.includes('NQ')) {
            throw new Error('Fallback directory options should include NQ');
        }
        if (symbolSelect.value !== 'NQ') {
            throw new Error('Selected symbol should update to fallback entry');
        }
    });
    shouldFailRefreshRequest = false;
    directoryResponseSymbols = mockDirectorySymbols;
    directoryResponseIntervals = mockDirectoryIntervals;
    directoryPreferredSymbol = null;
    renderResult.unmount();
    await cleanup();
})();
console.log('MarketDataModal directory refresh fallback test passed');
Date.now = originalDateNow;
