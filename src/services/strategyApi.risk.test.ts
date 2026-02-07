import { fetchStrategyRiskLogs } from './strategyApi.js';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

void (async () => {
  const originalFetch = globalThis.fetch;

  const payload = {
    strategy_id: 'alpha',
    page: 1,
    page_size: 50,
    total: 2,
    has_next: false,
    generated_at: '2024-06-12T12:00:30Z',
    entries: [
      {
        timestamp: '2024-06-12T12:00:00Z',
        level: 'info',
        action: 'risk_evaluation',
        context: {
          risk_checks: {
            summary: 'Daily risk review',
            evaluations: [
              {
                id: 'bool-pass',
                label: 'Boolean pass',
                passed: true,
                current_value: 1,
                threshold: 2
              },
              {
                id: 'bool-fail',
                label: 'Boolean fail',
                passed: false,
                current_value: 12,
                threshold: 10,
                reason: 'Exposure limit breached'
              },
              {
                id: 'legacy-warning',
                label: 'Legacy warning',
                status: 'warning',
                current_value: 19,
                threshold: 15,
                reason: 'Volatility elevated'
              },
              {
                code: 'code-only-evaluation'
              }
            ]
          }
        }
      },
      {
        timestamp: '2024-06-12T13:00:00Z',
        level: 'warning',
        action: 'risk_evaluation',
        context: {
          payload: {
            event: 'risk_review',
            risk_checks: {
              summary: 'Payload risk review',
              strategy_risk_manager: {
                evaluations: [
                  {
                    id: 'payload-srm-pass',
                    label: 'SRM pass',
                    passed: true,
                    current_value: 1,
                    threshold: 1
                  }
                ]
              },
              risk_engine: {
                evaluations: [
                  {
                    id: 'payload-engine-fail',
                    label: 'Engine fail',
                    passed: false,
                    current_value: 12,
                    threshold: 10,
                    reason: 'Engine exposure breached'
                  },
                  {
                    id: 'payload-engine-warning',
                    label: 'Engine warning',
                    status: 'warning',
                    current_value: 22,
                    threshold: 25,
                    reason: 'Drawdown increasing'
                  }
                ]
              }
            }
          }
        }
      },
      {
        timestamp: '2024-06-12T14:00:00Z',
        level: 'error',
        action: 'risk_evaluation',
        status: 'fail',
        message: 'Risk evaluation summary (FAIL) - Position limit triggered  ',
        context: {}
      }
    ]
  };

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload)
  }) as Response;

  globalThis.fetch = mockFetch as unknown as typeof fetch;

  try {
    const result = await fetchStrategyRiskLogs('test-token', { strategyId: 'alpha' });
    const [rootEntry, payloadEntry] = result.entries;
    assert(rootEntry, 'Risk log mapping should yield at least one entry');
    const checks = rootEntry.checks ?? [];
    const statusMap = new Map(checks.map((check) => [check.id, check.status]));
    assert(statusMap.get('bool-pass') === 'pass', 'Boolean pass flag should map to pass status');
    assert(statusMap.get('bool-fail') === 'fail', 'Boolean fail flag should map to fail status');
    assert(
      statusMap.get('legacy-warning') === 'warning',
      'Legacy textual status should continue to map correctly'
    );
    const codeOnlyCheck = checks.find((check) => check.id === 'code-only-evaluation');
    assert(codeOnlyCheck, 'Code-only risk evaluation should map using the code as the identifier');
    assert(
      codeOnlyCheck?.label === 'code-only-evaluation',
      'Code-only risk evaluation should surface its code as the label'
    );

    assert(payloadEntry, 'Risk log mapping should include payload-derived entry');
    const payloadChecks = payloadEntry?.checks ?? [];
    assert(payloadChecks.length === 3, 'Payload risk checks should flatten every evaluation');
    const payloadStatuses = new Map(payloadChecks.map((check) => [check.id, check.status]));
    assert(
      payloadStatuses.get('payload-srm-pass') === 'pass',
      'Payload SRM evaluation should pass'
    );
    assert(
      payloadStatuses.get('payload-engine-fail') === 'fail',
      'Payload engine fail evaluation should fail'
    );
    assert(
      payloadStatuses.get('payload-engine-warning') === 'warning',
      'Payload engine warning evaluation should remain a warning'
    );
    const payloadLabels = payloadChecks.map((check) => check.label ?? '');
    assert(
      payloadLabels.some((label) => label.startsWith('Strategy Risk Manager:')),
      'Payload labels should prefix the risk source for grouped evaluations'
    );
    assert(
      payloadLabels.some((label) => label.startsWith('Risk Engine:')),
      'Payload labels should include each risk source'
    );
    const sanitizedPayloadContext = payloadEntry?.context ?? null;
    assert(
      sanitizedPayloadContext === null,
      'Sanitized payload context should collapse when only blob fields remain'
    );

    const prefixedSummaryEntry = result.entries.find((entry) =>
      entry.message?.includes('Position limit triggered')
    );
    assert(prefixedSummaryEntry, 'Prefixed summary entry should be present');
    assert(
      prefixedSummaryEntry?.summary === 'Position limit triggered',
      'Risk evaluation summaries should strip prefixed status indicators'
    );
    assert(
      prefixedSummaryEntry?.message ===
        'Risk evaluation summary (FAIL) - Position limit triggered',
      'Original risk evaluation message should retain its prefix'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('strategyApi risk log mapping tests passed');
})();
