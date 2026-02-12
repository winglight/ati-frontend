import {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useTranslation } from '@i18n';
import Modal from './Modal';
import styles from './StrategyEditorModal.module.css';
import type {
  StrategyFileItem,
  StrategyItem,
  StrategyParameterConfig,
  StrategyScheduleWindow,
  StrategyTemplateItem,
  ScreenerScheduleMode
} from '@features/dashboard/types';
import type { SaveStrategyArgs } from '@store/thunks/strategies';
import { useAppSelector } from '@store/hooks';
import {
  fetchScreenerMetadata,
  getStrategyDetailSnapshot,
  type ScreenerFilterDefinition,
  type ScreenerMetadata
} from '@services/strategyApi';
import {
  fetchScreenerAiLogs,
  streamScreenerAiGenerate,
  type ScreenerAiConditionsResult,
  type ScreenerAiLogEntry
} from '@services/screenerAiApi';
import { FieldHelp } from '@components/FieldHelp';

interface StrategyEditorModalProps {
  open: boolean;
  strategy: StrategyItem | null;
  templates: StrategyTemplateItem[];
  templatesLoading: boolean;
  files: StrategyFileItem[];
  filesLoading: boolean;
  submitting: boolean;
  error?: string | null;
  onRefreshTemplates: () => void;
  onRefreshFiles: () => void;
  onSubmit: (values: SaveStrategyArgs) => void;
  onClose: () => void;
}

interface WindowDraft extends StrategyScheduleWindow {
  id: string;
}

interface ParameterDraft {
  id: string;
  name: string;
  label: string;
  type: string;
  value: string;
  description: string;
  defaultValue?: unknown;
  options?: StrategyParameterConfig['options'];
  min?: number | null;
  max?: number | null;
  step?: number | null;
}

interface ScreenerFilterDraft {
  id: string;
  field: string;
  value: string;
}

interface ScreenerScheduleDraft {
  mode: ScreenerScheduleMode;
  time: string;
  minute: string;
  weekday: string;
  day: string;
}

interface ComboboxOption {
  value: string;
  label: string;
  description?: string | null;
}

interface FormState {
  name: string;
  symbol: string;
  mode: StrategyItem['mode'];
  templateId: string;
  description: string;
  skipWeekends: boolean;
  windows: WindowDraft[];
  parameters: ParameterDraft[];
  enabled: boolean;
  active: boolean;
  tags: string;
  strategyFile: string;
  fileMode: 'new' | 'existing';
  autoGenerateFile: boolean;
  screenerInstrument: string;
  screenerLocation: string;
  screenerScanCode: string;
  screenerNumberOfRows: string;
  screenerFilters: ScreenerFilterDraft[];
  screenerSchedule: ScreenerScheduleDraft;
}

const createId = (): string => Math.random().toString(36).slice(2, 10);
const MAX_SCREENER_AI_IMAGES = 3;

const DEFAULT_WINDOW: StrategyScheduleWindow = { start: '00:00', end: '23:59' };
const EMPTY_WINDOW: StrategyScheduleWindow = { start: '', end: '' };
const DEFAULT_SCREENER_SCHEDULE: ScreenerScheduleDraft = {
  mode: 'manual',
  time: '09:30',
  minute: '0',
  weekday: 'mon',
  day: '1'
};
const SCREENER_BASE_FIELDS = new Set(['instrument', 'location_code', 'scan_code', 'number_of_rows']);
const SCREENER_FILTER_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

const createWindowDraft = (
  window?: StrategyScheduleWindow | null,
  fallback: StrategyScheduleWindow = EMPTY_WINDOW
): WindowDraft => ({
  id: createId(),
  start: window?.start ?? fallback.start,
  end: window?.end ?? fallback.end
});

const formatParameterValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
};

const formatJsonPreview = (value: unknown, maxChars = 1200): string => {
  if (value === null || value === undefined) {
    return '';
  }
  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, maxChars)}\n...`;
  } catch {
    return '';
  }
};

const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) {
        resolve(result);
      } else {
        reject(new Error('图片读取失败'));
      }
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });

const filterComboboxOptions = (options: ComboboxOption[], query: string): ComboboxOption[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return options.slice(0, 60);
  }
  return options
    .filter((option) => {
      const haystack = `${option.value} ${option.label} ${option.description ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, 60);
};

function FilterCombobox({
  value,
  options,
  placeholder,
  onChange
}: {
  value: string;
  options: ComboboxOption[];
  placeholder?: string;
  onChange: (nextValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filteredOptions = useMemo(
    () => filterComboboxOptions(options, inputValue),
    [options, inputValue]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <div className={styles.combobox} ref={containerRef}>
      <input
        className={styles.input}
        value={inputValue}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            setOpen(true);
          }
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          setInputValue(nextValue);
          setOpen(true);
        }}
        onBlur={() => {
          if (!inputValue.trim()) {
            onChange('');
            return;
          }
          const normalized = inputValue.trim().toLowerCase();
          const matched = options.find(
            (option) =>
              option.value.toLowerCase() === normalized ||
              option.label.toLowerCase() === normalized
          );
          if (matched) {
            onChange(matched.value);
            setInputValue(matched.value);
          }
        }}
      />
      {open ? (
        <div className={styles.comboboxList}>
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.comboboxItem}
                onClick={() => {
                  setInputValue(option.value);
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className={styles.comboboxLabel}>{option.label}</span>
                <span className={styles.comboboxValue}>{option.value}</span>
                {option.description ? (
                  <span className={styles.comboboxDescription}>{option.description}</span>
                ) : null}
              </button>
            ))
          ) : (
            <div className={styles.comboboxEmpty}>暂无匹配选项</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const toParameterDraft = (parameter: StrategyParameterConfig): ParameterDraft => {
  const rawValue =
    parameter.value === null || parameter.value === undefined
      ? parameter.defaultValue
      : parameter.value;

  return {
    id: `${parameter.name}-${createId()}`,
    name: parameter.name,
    label: typeof parameter.label === 'string' ? parameter.label : '',
    type: typeof parameter.type === 'string' ? parameter.type : '',
    value: formatParameterValue(rawValue),
    description: typeof parameter.description === 'string' ? parameter.description : '',
    defaultValue: parameter.defaultValue,
    options: parameter.options ?? null,
    min: parameter.min ?? null,
    max: parameter.max ?? null,
    step: parameter.step ?? null
  };
};

const createEmptyParameter = (): ParameterDraft => ({
  id: createId(),
  name: '',
  label: '',
  type: '',
  value: '',
  description: '',
  defaultValue: null,
  options: null,
  min: null,
  max: null,
  step: null
});

const toScreenerFilterDraft = (entry: [string, unknown]): ScreenerFilterDraft => ({
  id: createId(),
  field: entry[0],
  value: formatParameterValue(entry[1])
});

const createEmptyScreenerFilter = (): ScreenerFilterDraft => ({
  id: createId(),
  field: '',
  value: ''
});

const isScreenerTemplate = (templateId: string | null | undefined): boolean =>
  (templateId ?? '').trim().toLowerCase() === 'screener';

const coerceScheduleMode = (value: unknown): ScreenerScheduleMode => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (normalized === 'hourly' || normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly') {
    return normalized;
  }
  return 'manual';
};

const normalizeScreenerSchedule = (value: Record<string, unknown> | null | undefined): ScreenerScheduleDraft => {
  if (!value) {
    return { ...DEFAULT_SCREENER_SCHEDULE };
  }
  const mode = coerceScheduleMode(value.mode);
  const time = typeof value.time === 'string' ? value.time : DEFAULT_SCREENER_SCHEDULE.time;
  const minute = value.minute !== undefined && value.minute !== null ? String(value.minute) : DEFAULT_SCREENER_SCHEDULE.minute;
  const weekday = typeof value.weekday === 'string' ? value.weekday : DEFAULT_SCREENER_SCHEDULE.weekday;
  const day = value.day !== undefined && value.day !== null ? String(value.day) : DEFAULT_SCREENER_SCHEDULE.day;
  return {
    mode,
    time,
    minute,
    weekday,
    day
  };
};

const parseParameterValue = (value: string): unknown => {
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed === 'true';
  }
  const parsed = Number(trimmed);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  return trimmed;
};

const normalizeScheduleWindows = (windows: WindowDraft[]): StrategyScheduleWindow[] => {
  return windows
    .filter((window) => window.start.trim() && window.end.trim())
    .map((window) => ({ start: window.start.trim(), end: window.end.trim() }));
};

const normalizeParameters = (parameters: ParameterDraft[]): StrategyParameterConfig[] => {
  return parameters
    .filter((parameter) => parameter.name.trim())
    .map((parameter) => ({
      name: parameter.name.trim(),
      label:
        typeof parameter.label === 'string' && parameter.label.trim()
          ? parameter.label.trim()
          : parameter.name.trim(),
      type:
        typeof parameter.type === 'string' && parameter.type.trim()
          ? parameter.type.trim()
          : null,
      value: parseParameterValue(parameter.value),
      description:
        typeof parameter.description === 'string' && parameter.description.trim()
          ? parameter.description.trim()
          : null,
      defaultValue: parameter.defaultValue ?? null,
      options: parameter.options ?? null,
      min: parameter.min ?? null,
      max: parameter.max ?? null,
      step: parameter.step ?? null
    }));
};

const parseScreenerFilterValue = (
  value: string,
  definition?: ScreenerFilterDefinition | null
): unknown => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!definition) {
    const lowered = trimmed.toLowerCase();
    if (lowered === 'true') {
      return true;
    }
    if (lowered === 'false') {
      return false;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return trimmed;
  }
  const normalizedType = definition.type.toLowerCase();
  if (normalizedType.includes('bool')) {
    if (trimmed === 'true' || trimmed === 'false') {
      return trimmed === 'true';
    }
  }
  if (
    normalizedType.includes('int') ||
    normalizedType.includes('float') ||
    normalizedType.includes('double') ||
    normalizedType.includes('decimal') ||
    normalizedType.includes('number')
  ) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  return trimmed;
};

const buildScreenerProfile = (
  state: FormState,
  filterDefinitions: ScreenerFilterDefinition[]
): Record<string, unknown> => {
  const profile: Record<string, unknown> = {
    instrument: state.screenerInstrument.trim(),
    location_code: state.screenerLocation.trim(),
    scan_code: state.screenerScanCode.trim()
  };
  const numberOfRows = state.screenerNumberOfRows.trim();
  if (numberOfRows) {
    const parsed = Number(numberOfRows);
    profile.number_of_rows = Number.isFinite(parsed) ? parsed : numberOfRows;
  }

  const definitionMap = filterDefinitions.reduce<Record<string, ScreenerFilterDefinition>>((acc, def) => {
    acc[def.name] = def;
    return acc;
  }, {});

  state.screenerFilters.forEach((filter) => {
    const key = filter.field.trim();
    if (!key) {
      return;
    }
    const value = parseScreenerFilterValue(filter.value, definitionMap[key] ?? null);
    if (value === null || value === undefined || value === '') {
      return;
    }
    profile[key] = value;
  });

  return profile;
};

const buildScreenerSchedulePayload = (
  draft: ScreenerScheduleDraft
): Record<string, unknown> | null => {
  if (draft.mode === 'manual') {
    return null;
  }
  const toTimeWindow = (value: string): StrategyScheduleWindow | null => {
    if (!value) {
      return null;
    }
    const [hourRaw, minuteRaw] = value.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }
    const endMinute = minute + 1;
    const endHour = endMinute >= 60 ? (hour + 1) % 24 : hour;
    const normalizedMinute = endMinute % 60;
    const start = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const end = `${String(endHour).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`;
    return { start, end };
  };
  const payload: Record<string, unknown> = { mode: draft.mode };
  if (draft.mode === 'hourly') {
    const minute = Number(draft.minute);
    if (Number.isFinite(minute)) {
      payload.minute = minute;
    }
  }
  if (draft.mode === 'daily') {
    payload.time = draft.time.trim();
  }
  if (draft.mode === 'weekly') {
    payload.time = draft.time.trim();
    payload.weekday = draft.weekday;
  }
  if (draft.mode === 'monthly') {
    payload.time = draft.time.trim();
    const day = Number(draft.day);
    if (Number.isFinite(day)) {
      payload.day = day;
    }
  }
  if (draft.mode !== 'hourly') {
    const timeWindow = toTimeWindow(draft.time.trim());
    if (timeWindow) {
      payload.windows = [timeWindow];
    }
  }
  payload.skip_weekends = true;
  return payload;
};

const defaultFormState: FormState = {
  name: '',
  symbol: '',
  mode: 'paper',
  templateId: '',
  description: '',
  skipWeekends: true,
  windows: [createWindowDraft(null, DEFAULT_WINDOW)],
  parameters: [],
  enabled: true,
  active: false,
  tags: '',
  strategyFile: '',
  fileMode: 'new',
  autoGenerateFile: true,
  screenerInstrument: '',
  screenerLocation: '',
  screenerScanCode: '',
  screenerNumberOfRows: '3',
  screenerFilters: [],
  screenerSchedule: { ...DEFAULT_SCREENER_SCHEDULE }
};

const STRATEGY_FILE_BASE = 'src/strategies';

const normalizeTemplateIdentifier = (
  value: unknown,
  options: { transform?: boolean } = {}
): string | null => {
  const { transform = true } = options;

  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!transform || /^[A-Za-z0-9_]+$/.test(trimmed)) {
    return trimmed;
  }
  const segments = trimmed.split('.');
  const lastSegment = segments[segments.length - 1] || trimmed;
  const withoutSuffix = lastSegment.replace(/Strategy$/i, '');
  const snakeCase = toSnakeCase(withoutSuffix || lastSegment);
  return snakeCase || trimmed;
};

const resolveTemplateIdFromMetadata = (
  metadata: StrategyFileItem['metadata'] | null | undefined
): string | null => {
  if (!metadata) {
    return null;
  }
  const candidates = [
    metadata.strategyType,
    metadata.baseClassPath,
    metadata.baseClass,
    metadata.className,
    metadata.qualifiedName
  ];
  for (const candidate of candidates) {
    const identifier = normalizeTemplateIdentifier(candidate);
    if (identifier) {
      return identifier;
    }
  }
  return null;
};

const createWindowDraftsFromMetadata = (
  metadata: StrategyFileItem['metadata'] | null | undefined
): WindowDraft[] => {
  if (!metadata?.schedule) {
    return [createWindowDraft(null, DEFAULT_WINDOW)];
  }
  const windowsSource = metadata.schedule.windows?.length
    ? metadata.schedule.windows
    : [DEFAULT_WINDOW];
  return windowsSource.map((window) => {
    if (!window) {
      return createWindowDraft(null, DEFAULT_WINDOW);
    }
    const start =
      typeof window.start === 'string' ? window.start : window.start != null ? String(window.start) : '';
    const end = typeof window.end === 'string' ? window.end : window.end != null ? String(window.end) : '';
    const normalized: StrategyScheduleWindow = {
      start: start || DEFAULT_WINDOW.start,
      end: end || DEFAULT_WINDOW.end
    };
    return createWindowDraft(normalized, DEFAULT_WINDOW);
  });
};

const applyMetadataToFormState = (
  previous: FormState,
  metadata: StrategyFileItem['metadata'] | null | undefined,
  options: { forceName?: boolean } = {}
): FormState => {
  if (!metadata) {
    return previous;
  }

  const templateId = resolveTemplateIdFromMetadata(metadata);
  const parametersDraft = Array.isArray(metadata.parameters)
    ? metadata.parameters.map((parameter) => toParameterDraft(parameter))
    : metadata.parameters === null
      ? []
      : previous.parameters;
  const windows = createWindowDraftsFromMetadata(metadata);

  const nextState: FormState = {
    ...previous,
    templateId: templateId ?? previous.templateId,
    description: metadata.description ?? previous.description,
    parameters: parametersDraft,
    skipWeekends:
      typeof metadata.schedule?.skipWeekends === 'boolean'
        ? metadata.schedule.skipWeekends
        : previous.skipWeekends,
    windows
  };

  if (metadata.strategyName) {
    const trimmed = metadata.strategyName.trim();
    if (
      options.forceName ||
      !previous.name.trim() ||
      (previous.strategyFile && previous.name === toStrategyNameFromFile(previous.strategyFile))
    ) {
      nextState.name = trimmed;
    }
  }

  if (Array.isArray(metadata.parameters)) {
    const symbolParameter = metadata.parameters.find((parameter) => parameter.name === 'symbol');
    if (symbolParameter && symbolParameter.value !== undefined && symbolParameter.value !== null) {
      const rawValue = symbolParameter.value;
      if (typeof rawValue === 'string') {
        nextState.symbol = rawValue;
      } else if (typeof rawValue === 'number') {
        nextState.symbol = String(rawValue);
      } else if (typeof rawValue === 'boolean') {
        nextState.symbol = rawValue ? 'true' : 'false';
      } else {
        nextState.symbol = String(rawValue);
      }
    }
  }

  return nextState;
};

const toSnakeCase = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  let result = '';
  let previousIsLower = false;
  for (const char of trimmed.replace(/[\s-]+/g, '_')) {
    if (/^[A-Z]$/.test(char) && previousIsLower) {
      result += '_';
    }
    if (/^[A-Za-z0-9]$/.test(char)) {
      result += char.toLowerCase();
      previousIsLower = /[a-z0-9]/.test(char);
    } else if (char === '_' && !result.endsWith('_')) {
      result += '_';
      previousIsLower = false;
    }
  }
  return result.replace(/^_+|_+$/g, '') || 'strategy';
};

const toFileName = (value: string): string => {
  const stem = toSnakeCase(value);
  return stem ? `${stem}.py` : '';
};

const normalizeExistingFilePath = (filePath: string | null | undefined): string => {
  if (!filePath) {
    return '';
  }
  const trimmed = filePath.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith(`${STRATEGY_FILE_BASE}/`)) {
    return trimmed.slice(STRATEGY_FILE_BASE.length + 1);
  }
  return trimmed;
};

const toStrategyNameFromFile = (filePath: string): string => {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const stem = fileName.replace(/\.py$/i, '');
  const tokens = stem.split(/[_-]+/).filter(Boolean);
  if (!tokens.length) {
    return stem;
  }
  return tokens
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join('');
};

const buildScreenerDrafts = (
  profile: Record<string, unknown> | null
): {
  instrument: string;
  location: string;
  scanCode: string;
  numberOfRows: string;
  filters: ScreenerFilterDraft[];
} => {
  const instrument = typeof profile?.instrument === 'string' ? profile.instrument : '';
  const location = typeof profile?.location_code === 'string' ? profile.location_code : '';
  const scanCode = typeof profile?.scan_code === 'string' ? profile.scan_code : '';
  const numberOfRows =
    profile?.number_of_rows !== undefined && profile?.number_of_rows !== null
      ? String(profile.number_of_rows)
      : defaultFormState.screenerNumberOfRows;
  const filters = profile
    ? Object.entries(profile)
        .filter(([key]) => !SCREENER_BASE_FIELDS.has(key))
        .map((entry) => toScreenerFilterDraft(entry))
    : [];

  return { instrument, location, scanCode, numberOfRows, filters };
};

function StrategyEditorModal({
  open,
  strategy,
  templates,
  templatesLoading,
  files,
  filesLoading,
  submitting,
  error,
  onRefreshTemplates,
  onRefreshFiles,
  onSubmit,
  onClose
}: StrategyEditorModalProps) {
  const { t } = useTranslation();
  const token = useAppSelector((state) => state.auth.token);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [metadataAppliedFor, setMetadataAppliedFor] = useState<string | null>(null);
  const [screenerMetadata, setScreenerMetadata] = useState<ScreenerMetadata | null>(null);
  const [screenerMetadataStatus, setScreenerMetadataStatus] = useState<
    'idle' | 'loading' | 'succeeded' | 'failed'
  >('idle');
  const [screenerMetadataError, setScreenerMetadataError] = useState<string | null>(null);
  const [detailLoadedFor, setDetailLoadedFor] = useState<string | null>(null);
  const [screenerAiInput, setScreenerAiInput] = useState('');
  const [screenerAiImages, setScreenerAiImages] = useState<string[]>([]);
  const [screenerAiImageNames, setScreenerAiImageNames] = useState<string[]>([]);
  const [screenerAiGenerating, setScreenerAiGenerating] = useState(false);
  const [screenerAiRawResponse, setScreenerAiRawResponse] = useState('');
  const [screenerAiError, setScreenerAiError] = useState<string | null>(null);
  const [screenerAiLogs, setScreenerAiLogs] = useState<ScreenerAiLogEntry[]>([]);
  const [screenerAiLogsLoading, setScreenerAiLogsLoading] = useState(false);

  const availableTemplates = useMemo(() => {
    const merged: StrategyTemplateItem[] = [];

    templates.forEach((template) => {
      const identifier = normalizeTemplateIdentifier(template?.id, { transform: false });
      if (!identifier) {
        return;
      }
      const name = template.name?.trim() || identifier;
      merged.push({
        id: identifier,
        name,
        description: template.description ?? null,
        parameters: template.parameters ?? null
      });
    });

    files.forEach((file) => {
      const metadata = file.metadata ?? null;
      if (!metadata) {
        return;
      }
      const baseId = resolveTemplateIdFromMetadata(metadata);
      if (!baseId) {
        return;
      }
      const existingIndex = merged.findIndex((template) => template.id === baseId);
      const existing = existingIndex >= 0 ? merged[existingIndex] : null;
      const name = metadata.strategyName?.trim() || metadata.baseClass?.trim() || existing?.name || baseId;
      const parameters = metadata.parameters?.length ? metadata.parameters : existing?.parameters ?? null;
      const description = metadata.description ?? existing?.description ?? null;
      const nextTemplate: StrategyTemplateItem = {
        id: baseId,
        name,
        description,
        parameters
      };

      if (existingIndex >= 0) {
        merged[existingIndex] = nextTemplate;
      } else {
        merged.push(nextTemplate);
      }
    });

    if (!merged.some((template) => template.id === 'screener')) {
      merged.push({
        id: 'screener',
        name: 'Screener',
        description: 'IB 筛选器策略',
        parameters: null
      });
    }

    return merged.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  }, [files, templates]);

  useEffect(() => {
    if (!open) {
      setFormState(defaultFormState);
      setValidationError(null);
      setMetadataAppliedFor(null);
      setScreenerAiInput('');
      setScreenerAiImages([]);
      setScreenerAiImageNames([]);
      setScreenerAiGenerating(false);
      setScreenerAiRawResponse('');
      setScreenerAiError(null);
      setScreenerAiLogs([]);
      setScreenerAiLogsLoading(false);
      return;
    }

    const scheduleWindows = strategy?.schedule?.windows?.length
      ? strategy.schedule.windows.map((window) => createWindowDraft(window, EMPTY_WINDOW))
      : [createWindowDraft(null, DEFAULT_WINDOW)];

    const parameters = strategy?.parameters?.length
      ? strategy.parameters.map((parameter) => toParameterDraft(parameter))
      : [];

    const screenerProfile = (strategy?.screenerProfile ?? null) as Record<string, unknown> | null;
    const screenerDrafts = buildScreenerDrafts(screenerProfile);
    const screenerSchedule = normalizeScreenerSchedule(
      (strategy?.screenerSchedule ?? null) as Record<string, unknown> | null
    );

    const normalizedExistingFilePath = normalizeExistingFilePath(
      (strategy as { filePath?: string | null } | null)?.filePath ?? null
    );
    const derivedFileMode = normalizedExistingFilePath ? 'existing' : 'new';
    const derivedStrategyFile =
      normalizedExistingFilePath || (strategy?.name ? toFileName(strategy.name) : '');

    setFormState({
      name: strategy?.name ?? '',
      symbol: strategy?.symbol ?? '',
      mode: strategy?.mode ?? 'paper',
      templateId: strategy?.templateId ?? '',
      description: strategy?.description ?? '',
      skipWeekends: strategy?.schedule?.skipWeekends ?? true,
      windows: scheduleWindows,
      parameters,
      enabled: typeof strategy?.enabled === 'boolean' ? strategy.enabled : strategy?.status !== 'stopped',
      active: typeof strategy?.active === 'boolean' ? strategy.active : strategy?.status === 'running',
      tags: strategy?.tags?.join(', ') ?? '',
      strategyFile: derivedStrategyFile,
      fileMode: derivedFileMode,
      autoGenerateFile: !normalizedExistingFilePath,
      screenerInstrument: screenerDrafts.instrument,
      screenerLocation: screenerDrafts.location,
      screenerScanCode: screenerDrafts.scanCode,
      screenerNumberOfRows: screenerDrafts.numberOfRows,
      screenerFilters: screenerDrafts.filters,
      screenerSchedule
    });
    setValidationError(null);
    setMetadataAppliedFor(null);
    setDetailLoadedFor(null);
    setScreenerAiInput('');
    setScreenerAiImages([]);
    setScreenerAiImageNames([]);
    setScreenerAiGenerating(false);
    setScreenerAiRawResponse('');
    setScreenerAiError(null);
    setScreenerAiLogs([]);
    setScreenerAiLogsLoading(false);
  }, [open, strategy]);

  useEffect(() => {
    if (!open || !strategy?.id || !token) {
      return;
    }
    if (detailLoadedFor === strategy.id) {
      return;
    }
    const missingScreener =
      !strategy.screenerProfile ||
      Object.keys(strategy.screenerProfile as Record<string, unknown>).length === 0;
    if (!missingScreener) {
      setDetailLoadedFor(strategy.id);
      return;
    }
    let active = true;
    getStrategyDetailSnapshot(token, strategy.id)
      .then(({ detail }) => {
        if (!active || detail?.id !== strategy.id) {
          return;
        }
        const profile = (detail.screenerProfile ?? null) as Record<string, unknown> | null;
        const schedule = (detail.screenerSchedule ?? null) as Record<string, unknown> | null;
        const screenerDrafts = buildScreenerDrafts(profile);
        setFormState((previous) => {
          const shouldApply =
            !previous.screenerInstrument &&
            !previous.screenerLocation &&
            !previous.screenerScanCode &&
            previous.screenerFilters.length === 0;
          if (!shouldApply) {
            return previous;
          }
          return {
            ...previous,
            screenerInstrument: screenerDrafts.instrument,
            screenerLocation: screenerDrafts.location,
            screenerScanCode: screenerDrafts.scanCode,
            screenerNumberOfRows: screenerDrafts.numberOfRows,
            screenerFilters: screenerDrafts.filters,
            screenerSchedule: normalizeScreenerSchedule(schedule)
          };
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
      })
      .finally(() => {
        if (active) {
          setDetailLoadedFor(strategy.id);
        }
      });
    return () => {
      active = false;
    };
  }, [detailLoadedFor, open, strategy?.id, strategy?.screenerProfile, token]);

  const selectedTemplate = useMemo(
    () => availableTemplates.find((template) => template.id === formState.templateId) ?? null,
    [availableTemplates, formState.templateId]
  );
  const isScreener = useMemo(() => isScreenerTemplate(formState.templateId), [formState.templateId]);

  useEffect(() => {
    if (!open || !isScreener || !token) {
      return;
    }
    if (screenerMetadataStatus === 'loading' || screenerMetadataStatus === 'succeeded') {
      return;
    }
    setScreenerMetadataStatus('loading');
    setScreenerMetadataError(null);
    fetchScreenerMetadata(token)
      .then((metadata) => {
        setScreenerMetadata(metadata);
        setScreenerMetadataStatus('succeeded');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '加载筛选器元数据失败';
        setScreenerMetadataError(message);
        setScreenerMetadataStatus('failed');
      });
  }, [open, isScreener, token, screenerMetadataStatus]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (formState.templateId || !availableTemplates.length) {
      return;
    }
    setFormState((previous) => {
      if (previous.templateId || !availableTemplates.length) {
        return previous;
      }
      return { ...previous, templateId: availableTemplates[0].id };
    });
  }, [open, availableTemplates, formState.templateId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (formState.fileMode !== 'existing') {
      return;
    }
    if (!formState.strategyFile) {
      return;
    }
    if (metadataAppliedFor === formState.strategyFile) {
      return;
    }
    const metadata = files.find((file) => file.path === formState.strategyFile)?.metadata ?? null;
    if (!metadata) {
      return;
    }
    setFormState((previous) => applyMetadataToFormState(previous, metadata));
    setMetadataAppliedFor(formState.strategyFile);
  }, [open, formState.strategyFile, formState.fileMode, files, metadataAppliedFor]);

  const resolvedStrategyFile = useMemo(() => {
    if (formState.fileMode === 'existing') {
      return formState.strategyFile;
    }
    if (formState.strategyFile) {
      return formState.strategyFile;
    }
    return formState.name ? toFileName(formState.name) : '';
  }, [formState.fileMode, formState.strategyFile, formState.name]);

  const strategyFileDisplayPath = resolvedStrategyFile
    ? `${STRATEGY_FILE_BASE}/${resolvedStrategyFile}`
    : `${STRATEGY_FILE_BASE}/...`;

  const handleBasicChange = (field: keyof FormState) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const target = event.target;
    const value = target.type === 'checkbox'
      ? (target as HTMLInputElement).checked
      : target.value;
    setFormState((previous) => {
      const nextState: FormState = {
        ...previous,
        [field]: value
      };
      if (field === 'name') {
        const nameValue = typeof value === 'string' ? value : String(value ?? '');
        const normalizedName = nameValue ? toStrategyNameFromFile(toFileName(nameValue)) : '';
        nextState.name = normalizedName;
        if (previous.fileMode === 'new' || previous.autoGenerateFile) {
          nextState.strategyFile = normalizedName ? toFileName(normalizedName) : '';
          nextState.autoGenerateFile = true;
        }
      }
      return nextState;
    });
  };

  const handleTemplateChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const templateId = event.target.value;
    setFormState((previous) => {
      const template = availableTemplates.find((item) => item.id === templateId) ?? null;
      const parameters = templateId
        ? template?.parameters?.map((parameter) => toParameterDraft(parameter)) ?? []
        : previous.parameters;
      return {
        ...previous,
        templateId,
        parameters
      };
    });
  };

  const handleFileSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const fileValue = event.target.value;
    if (fileValue === '__new__') {
      setFormState((previous) => ({
        ...previous,
        fileMode: 'new',
        autoGenerateFile: true,
        strategyFile: previous.name ? toFileName(previous.name) : '',
        windows: previous.windows.length ? previous.windows : [createWindowDraft(null, DEFAULT_WINDOW)]
      }));
      setMetadataAppliedFor(null);
      return;
    }
    setFormState((previous) => {
      const matching = files.find((file) => file.path === fileValue);
      const derivedName = matching
        ? toStrategyNameFromFile(matching.path)
        : toStrategyNameFromFile(fileValue);
      let nextState: FormState = {
        ...previous,
        fileMode: 'existing',
        autoGenerateFile: false,
        strategyFile: fileValue,
        name: derivedName
      };
      if (matching?.metadata) {
        nextState = applyMetadataToFormState(nextState, matching.metadata, { forceName: true });
      } else if (!nextState.windows.length) {
        nextState.windows = [createWindowDraft(null, DEFAULT_WINDOW)];
      }
      return nextState;
    });
    setMetadataAppliedFor(fileValue);
  };

  const handleWindowChange = (id: string, field: keyof StrategyScheduleWindow) => (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setFormState((previous) => ({
      ...previous,
      windows: previous.windows.map((window) =>
        window.id === id
          ? {
              ...window,
              [field]: value
            }
          : window
      )
    }));
  };

  const handleAddWindow = () => {
    setFormState((previous) => ({
      ...previous,
      windows: [...previous.windows, createWindowDraft(null, EMPTY_WINDOW)]
    }));
  };

  const handleRemoveWindow = (id: string) => {
    setFormState((previous) => ({
      ...previous,
      windows: previous.windows.filter((window) => window.id !== id)
    }));
  };

  const handleParameterChange = (id: string, field: keyof ParameterDraft) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setFormState((previous) => ({
      ...previous,
      parameters: previous.parameters.map((parameter) =>
        parameter.id === id
          ? {
              ...parameter,
              [field]: value
            }
          : parameter
      )
    }));
  };

  const handleAddParameter = () => {
    setFormState((previous) => ({
      ...previous,
      parameters: [...previous.parameters, createEmptyParameter()]
    }));
  };

  const handleRemoveParameter = (id: string) => {
    setFormState((previous) => ({
      ...previous,
      parameters: previous.parameters.filter((parameter) => parameter.id !== id)
    }));
  };

  const handleScreenerProfileChange = (field: keyof FormState) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setFormState((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const handleScreenerProfileValue = (field: keyof FormState) => (value: string) => {
    setFormState((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const updateScreenerFilter = (
    id: string,
    field: keyof ScreenerFilterDraft,
    value: string
  ) => {
    setFormState((previous) => ({
      ...previous,
      screenerFilters: previous.screenerFilters.map((filter) =>
        filter.id === id
          ? {
              ...filter,
              [field]: value
            }
          : filter
      )
    }));
  };

  const handleScreenerFilterChange = (id: string, field: keyof ScreenerFilterDraft) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    updateScreenerFilter(id, field, event.target.value);
  };

  const handleAddScreenerFilter = () => {
    setFormState((previous) => ({
      ...previous,
      screenerFilters: [...previous.screenerFilters, createEmptyScreenerFilter()]
    }));
  };

  const handleRemoveScreenerFilter = (id: string) => {
    setFormState((previous) => ({
      ...previous,
      screenerFilters: previous.screenerFilters.filter((filter) => filter.id !== id)
    }));
  };

  const handleScreenerScheduleChange = (field: keyof ScreenerScheduleDraft) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setFormState((previous) => ({
      ...previous,
      screenerSchedule: {
        ...previous.screenerSchedule,
        [field]: value
      }
    }));
  };

  const applyScreenerAiConditions = useCallback(
    (conditions: ScreenerAiConditionsResult | null | undefined) => {
      if (!conditions) {
        return;
      }
      setFormState((previous) => {
        const next: FormState = { ...previous };
        if (typeof conditions.instrument === 'string' && conditions.instrument.trim()) {
          next.screenerInstrument = conditions.instrument.trim();
        }
        if (
          typeof conditions.location_code === 'string' &&
          conditions.location_code.trim()
        ) {
          next.screenerLocation = conditions.location_code.trim();
        }
        if (typeof conditions.scan_code === 'string' && conditions.scan_code.trim()) {
          next.screenerScanCode = conditions.scan_code.trim();
        }
        if (typeof conditions.number_of_rows === 'number' && Number.isFinite(conditions.number_of_rows)) {
          next.screenerNumberOfRows = String(Math.max(1, Math.floor(conditions.number_of_rows)));
        }
        if (Array.isArray(conditions.filters)) {
          const mappedFilters = conditions.filters
            .filter((entry) => entry && typeof entry.field === 'string' && entry.field.trim())
            .map((entry) => ({
              id: createId(),
              field: entry.field.trim(),
              value: formatParameterValue(entry.value)
            }));
          if (mappedFilters.length) {
            next.screenerFilters = mappedFilters;
          }
        }
        return next;
      });
    },
    []
  );

  const refreshScreenerAiLogs = useCallback(async () => {
    if (!token || !open || !isScreener) {
      return;
    }
    setScreenerAiLogsLoading(true);
    try {
      const response = await fetchScreenerAiLogs(token, { limit: 10 });
      setScreenerAiLogs(Array.isArray(response.items) ? response.items : []);
    } catch {
      setScreenerAiLogs([]);
    } finally {
      setScreenerAiLogsLoading(false);
    }
  }, [isScreener, open, token]);

  useEffect(() => {
    if (!open || !isScreener || !token) {
      return;
    }
    void refreshScreenerAiLogs();
  }, [isScreener, open, refreshScreenerAiLogs, token]);

  const appendScreenerAiImages = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (!imageFiles.length) {
        return;
      }
      const remaining = Math.max(0, MAX_SCREENER_AI_IMAGES - screenerAiImages.length);
      if (remaining <= 0) {
        setScreenerAiError(`最多上传 ${MAX_SCREENER_AI_IMAGES} 张图片`);
        return;
      }
      const selectedFiles = imageFiles.slice(0, remaining);
      try {
        const encoded = await Promise.all(selectedFiles.map((file) => fileToDataUri(file)));
        setScreenerAiImages((previous) => [...previous, ...encoded]);
        setScreenerAiImageNames((previous) => [
          ...previous,
          ...selectedFiles.map((file) => file.name || `image-${Date.now()}`)
        ]);
        setScreenerAiError(null);
      } catch {
        setScreenerAiError('图片读取失败，请重试');
      }
    },
    [screenerAiImages.length]
  );

  const handleScreenerAiImageUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    await appendScreenerAiImages(files);
    event.target.value = '';
  };

  const handleScreenerAiPaste = async (
    event: ClipboardEvent<HTMLTextAreaElement>
  ) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) {
      return;
    }
    event.preventDefault();
    await appendScreenerAiImages(files);
  };

  const handleRemoveScreenerAiImage = (index: number) => {
    setScreenerAiImages((previous) => previous.filter((_, idx) => idx !== index));
    setScreenerAiImageNames((previous) => previous.filter((_, idx) => idx !== index));
  };

  const handleGenerateScreenerAiConditions = async () => {
    if (!token) {
      setScreenerAiError('当前尚未登录，无法调用 AI');
      return;
    }
    if (!screenerAiInput.trim() && !screenerAiImages.length) {
      setScreenerAiError('请输入条件描述或上传图片');
      return;
    }
    setScreenerAiGenerating(true);
    setScreenerAiError(null);
    setScreenerAiRawResponse('');
    const currentProfile = buildScreenerProfile(formState, screenerFilterDefinitions);
    try {
      await streamScreenerAiGenerate(
        token,
        {
          user_input: screenerAiInput.trim(),
          images: screenerAiImages,
          current_profile: currentProfile
        },
        {
          onEvent: (event) => {
            if (event.type === 'delta') {
              setScreenerAiRawResponse((previous) => previous + event.content);
              return;
            }
            if (event.type === 'result') {
              if (typeof event.raw_text === 'string' && event.raw_text.trim()) {
                setScreenerAiRawResponse(event.raw_text);
              }
              applyScreenerAiConditions(event.conditions);
              return;
            }
            if (event.type === 'error') {
              setScreenerAiError(event.message);
            }
          }
        }
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI 条件生成失败';
      setScreenerAiError(message);
    } finally {
      setScreenerAiGenerating(false);
      void refreshScreenerAiLogs();
    }
  };

  const tagsList = useMemo(() => {
    return formState.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }, [formState.tags]);

  const allScreenerFilterDefinitions = useMemo(
    () => screenerMetadata?.filters ?? [],
    [screenerMetadata?.filters]
  );
  const screenerInstrumentOptions = useMemo(() => {
    const options = screenerMetadata?.instruments ?? [];
    const seen = new Set<string>();
    return options.filter((option) => {
      const key = option.value.trim().toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [screenerMetadata?.instruments]);
  const screenerLocationOptions = useMemo(() => {
    const options = screenerMetadata?.locations ?? [];
    const seen = new Set<string>();
    return options.filter((option) => {
      const key = option.value.trim().toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [screenerMetadata?.locations]);

  const normalizedOptionText = useCallback((value: string) => value.trim().toLowerCase(), []);
  const screenerFilterDefinitions = useMemo(() => {
    if (!allScreenerFilterDefinitions.length) {
      return formState.screenerFilters
        .map((filter) => filter.field.trim())
        .filter(Boolean)
        .map((field) => ({
          name: field,
          label: field,
          type: 'number',
          description: '字段来自当前策略/AI 返回，未出现在元数据清单中。',
          options: null,
          group: null,
          min: null,
          max: null,
          step: null
        }));
    }
    const normalizedInstrument = normalizedOptionText(formState.screenerInstrument);
    let baseDefinitions = allScreenerFilterDefinitions;
    if (!normalizedInstrument) {
      baseDefinitions = allScreenerFilterDefinitions;
    } else {
      const matchedInstrument = screenerInstrumentOptions.find(
        (option) =>
          normalizedOptionText(option.value) === normalizedInstrument ||
          normalizedOptionText(option.label) === normalizedInstrument
      );
      const filterGroups = (matchedInstrument?.filters ?? [])
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean);
      if (!filterGroups.length) {
        baseDefinitions = allScreenerFilterDefinitions;
      } else {
        baseDefinitions = allScreenerFilterDefinitions.filter((definition) => {
          if (!definition.group) {
            return true;
          }
          return filterGroups.includes(definition.group.trim().toUpperCase());
        });
      }
    }
    const known = new Set(baseDefinitions.map((definition) => definition.name.toLowerCase()));
    const extraDefinitions = formState.screenerFilters
      .map((filter) => filter.field.trim())
      .filter(Boolean)
      .filter((field) => !known.has(field.toLowerCase()))
      .map((field) => ({
        name: field,
        label: field,
        type: 'number',
        description: '字段来自当前策略/AI 返回，未出现在元数据清单中。',
        options: null,
        group: null,
        min: null,
        max: null,
        step: null
      }));
    return [...baseDefinitions, ...extraDefinitions];
  }, [
    allScreenerFilterDefinitions,
    formState.screenerFilters,
    formState.screenerInstrument,
    normalizedOptionText,
    screenerInstrumentOptions
  ]);
  const screenerFilterOptions = useMemo<ComboboxOption[]>(() => {
    return screenerFilterDefinitions.map((definition) => ({
      value: definition.name,
      label: definition.label,
      description: definition.description
    }));
  }, [screenerFilterDefinitions]);
  const screenerFilterNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const definition of screenerFilterDefinitions) {
      if (!definition.name) continue;
      map.set(definition.name.toLowerCase(), definition.name);
      if (definition.label) {
        map.set(definition.label.toLowerCase(), definition.name);
      }
    }
    return map;
  }, [screenerFilterDefinitions]);
  const resolveInstrumentTokens = useCallback(
    (rawValue: string) => {
      const normalized = normalizedOptionText(rawValue);
      if (!normalized) {
        return [] as string[];
      }
      const matched = screenerInstrumentOptions.find(
        (option) =>
          normalizedOptionText(option.value) === normalized ||
          normalizedOptionText(option.label) === normalized
      );
      const candidates = [
        matched?.value ?? rawValue,
        matched?.label ?? rawValue,
      ].filter((value) => Boolean(value));
      const tokens = new Set<string>();
      candidates.forEach((candidate) => {
        const candidateNormalized = normalizedOptionText(String(candidate));
        if (!candidateNormalized) {
          return;
        }
        tokens.add(candidateNormalized);
        const prefix = candidateNormalized.split('.')[0]?.trim();
        if (prefix) {
          tokens.add(prefix);
        }
      });
      return Array.from(tokens);
    },
    [normalizedOptionText, screenerInstrumentOptions]
  );

  const screenerScanCodeOptions = useMemo(() => {
    const options = screenerMetadata?.scanCodes ?? [];
    const seen = new Set<string>();
    const filtered = options.filter((option) => {
      const key = option.value.trim().toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    const instrumentTokens = resolveInstrumentTokens(formState.screenerInstrument);
    if (!instrumentTokens.length) {
      return [];
    }
    return filtered.filter((option) => {
      const instruments = option.instruments ?? [];
      if (!instruments.length) {
        return true;
      }
      return instruments.some((entry) => {
        const normalized = entry.trim().toUpperCase();
        return instrumentTokens.some((token) => {
          const tokenUpper = token.trim().toUpperCase();
          return (
            normalized === tokenUpper ||
            normalized.startsWith(`${tokenUpper}.`) ||
            tokenUpper.startsWith(`${normalized}.`)
          );
        });
      });
    });
  }, [formState.screenerInstrument, screenerMetadata?.scanCodes, resolveInstrumentTokens]);
  const screenerFilterMap = useMemo(() => {
    return screenerFilterDefinitions.reduce<Record<string, ScreenerFilterDefinition>>((acc, definition) => {
      acc[definition.name] = definition;
      return acc;
    }, {});
  }, [screenerFilterDefinitions]);

  const screenerInstrumentTokens = useMemo(
    () => resolveInstrumentTokens(formState.screenerInstrument),
    [formState.screenerInstrument, resolveInstrumentTokens]
  );

  useEffect(() => {
    if (!open || !isScreener || !screenerMetadata) {
      return;
    }
    const normalizeValue = (value: string, options: { value: string; label: string }[]) => {
      const normalized = normalizedOptionText(value);
      if (!normalized) {
        return value;
      }
      const matched = options.find(
        (option) =>
          normalizedOptionText(option.value) === normalized ||
          normalizedOptionText(option.label) === normalized
      );
      return matched?.value ?? value;
    };
    const nextInstrument = normalizeValue(formState.screenerInstrument, screenerInstrumentOptions);
    const nextLocation = normalizeValue(formState.screenerLocation, screenerLocationOptions);
    const nextScanCode = normalizeValue(
      formState.screenerScanCode,
      (screenerMetadata.scanCodes ?? []).map((option) => ({
        value: option.value,
        label: option.label
      }))
    );
    if (
      nextInstrument === formState.screenerInstrument &&
      nextLocation === formState.screenerLocation &&
      nextScanCode === formState.screenerScanCode
    ) {
      return;
    }
    setFormState((previous) => ({
      ...previous,
      screenerInstrument: nextInstrument,
      screenerLocation: nextLocation,
      screenerScanCode: nextScanCode
    }));
  }, [
    formState.screenerInstrument,
    formState.screenerLocation,
    formState.screenerScanCode,
    isScreener,
    normalizedOptionText,
    open,
    screenerInstrumentOptions,
    screenerLocationOptions,
    screenerMetadata
  ]);

  const filteredLocationOptions = useMemo(() => {
    if (!screenerInstrumentTokens.length) {
      return [];
    }
    const filtered = screenerLocationOptions.filter((option) => {
      const value = normalizedOptionText(option.value);
      const label = normalizedOptionText(option.label);
      return screenerInstrumentTokens.some((token) => {
        return (
          value === token ||
          label === token ||
          value.startsWith(`${token}.`) ||
          value.startsWith(`${token}_`) ||
          label.startsWith(`${token}.`) ||
          label.startsWith(`${token} `)
        );
      });
    });
    return filtered.length ? filtered : screenerLocationOptions;
  }, [normalizedOptionText, screenerInstrumentTokens, screenerLocationOptions]);

  useEffect(() => {
    if (!formState.screenerLocation.trim()) {
      return;
    }
    if (!filteredLocationOptions.length) {
      return;
    }
    const normalized = normalizedOptionText(formState.screenerLocation);
    const matches = filteredLocationOptions.some(
      (option) =>
        normalizedOptionText(option.value) === normalized ||
        normalizedOptionText(option.label) === normalized
    );
    if (!matches) {
      setFormState((previous) => ({
        ...previous,
        screenerLocation: ''
      }));
    }
  }, [filteredLocationOptions, formState.screenerLocation, normalizedOptionText]);

  useEffect(() => {
    if (!formState.screenerScanCode.trim()) {
      return;
    }
    if (!screenerScanCodeOptions.length) {
      if (screenerInstrumentTokens.length) {
        setFormState((previous) => ({
          ...previous,
          screenerScanCode: ''
        }));
      }
      return;
    }
    const normalized = normalizedOptionText(formState.screenerScanCode);
    const matches = screenerScanCodeOptions.some(
      (option) =>
        normalizedOptionText(option.value) === normalized ||
        normalizedOptionText(option.label) === normalized
    );
    if (!matches) {
      setFormState((previous) => ({
        ...previous,
        screenerScanCode: ''
      }));
    }
  }, [
    formState.screenerScanCode,
    normalizedOptionText,
    screenerScanCodeOptions,
    screenerInstrumentTokens.length
  ]);

  const scanCodeHelpDescription = useMemo(() => {
    if (!screenerScanCodeOptions.length) {
      return '暂无可用选项';
    }
    return (
      <div className={styles.scanCodeHelpList}>
        {screenerScanCodeOptions.map((option) => (
          <div key={option.value} className={styles.scanCodeHelpItem}>
            <div className={styles.scanCodeHelpTitle}>{option.label}</div>
            <div className={styles.scanCodeHelpCode}>{option.value}</div>
            <div className={styles.scanCodeHelpDescription}>
              {option.description ?? '暂无描述'}
            </div>
          </div>
        ))}
      </div>
    );
  }, [screenerScanCodeOptions]);

  const locationHelpDescription = useMemo(() => {
    if (!filteredLocationOptions.length) {
      return '暂无可用选项';
    }
    return (
      <div className={styles.scanCodeHelpList}>
        {filteredLocationOptions.map((option) => (
          <div key={option.value} className={styles.scanCodeHelpItem}>
            <div className={styles.scanCodeHelpTitle}>{option.label}</div>
            <div className={styles.scanCodeHelpCode}>{option.value}</div>
            <div className={styles.scanCodeHelpDescription}>
              {option.description ?? '暂无描述'}
            </div>
          </div>
        ))}
      </div>
    );
  }, [filteredLocationOptions]);

  const selectedFileValue = formState.fileMode === 'existing' ? formState.strategyFile : '__new__';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isScreenerStrategy = isScreenerTemplate(formState.templateId);
    if (!formState.name.trim()) {
      setValidationError('请输入策略名称');
      return;
    }
    const resolvedSymbol = formState.symbol.trim();
    if (!isScreenerStrategy && !resolvedSymbol) {
      setValidationError('请输入交易合约代码');
      return;
    }
    if (isScreenerStrategy) {
      if (!formState.screenerInstrument.trim()) {
        setValidationError('请输入 Instrument');
        return;
      }
      if (!formState.screenerLocation.trim()) {
        setValidationError('请输入 Location');
        return;
      }
      if (!formState.screenerScanCode.trim()) {
        setValidationError('请输入 Scan Code');
        return;
      }
      if (!formState.screenerNumberOfRows.trim()) {
        setValidationError('请输入 Number of Rows');
        return;
      }
      const invalidFilter = formState.screenerFilters.find((filter) => {
        const key = filter.field.trim();
        return key && !SCREENER_FILTER_FIELD_PATTERN.test(key);
      });
      if (invalidFilter) {
        setValidationError('筛选字段格式无效，仅支持字母、数字、下划线和中划线');
        return;
      }
    }

    const windows = normalizeScheduleWindows(formState.windows);
    if (!isScreenerStrategy && !windows.length) {
      setValidationError('至少需要设置一个交易时段');
      return;
    }

    const parameters = normalizeParameters(formState.parameters);
    const description = formState.description.trim();

    if (!formState.templateId.trim()) {
      setValidationError('请选择一个策略模板');
      return;
    }

    const payload: SaveStrategyArgs = {
      id: strategy?.id,
      name: formState.name.trim(),
      symbol: resolvedSymbol,
      mode: formState.mode,
      templateId: formState.templateId || null,
      description: description || undefined,
      skipWeekends: formState.skipWeekends,
      windows,
      parameters,
      enabled: formState.enabled,
      active: formState.active,
      tags: tagsList
    };

    if (isScreenerStrategy) {
      payload.screenerProfile = buildScreenerProfile(formState, screenerFilterDefinitions);
      const schedulePayload = buildScreenerSchedulePayload(formState.screenerSchedule);
      payload.screenerSchedule = schedulePayload ?? null;
    }

    const filePath = resolvedStrategyFile.trim();
    if (filePath) {
      payload.filePath = filePath;
    }

    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      title={strategy ? t('modals.strategy_editor.title_edit') : t('modals.strategy_editor.title_new')}
      size="lg"
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{t('modals.strategy_editor.sections.basic.title')}</h3>
          </div>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.label}>{t('modals.strategy_editor.fields.name.label')}</span>
              <input
                className={styles.input}
                value={formState.name}
                onChange={handleBasicChange('name')}
                placeholder={t('modals.strategy_editor.fields.name.placeholder')}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('modals.strategy_editor.fields.symbol.label')}</span>
              <input
                className={styles.input}
                value={formState.symbol}
                onChange={handleBasicChange('symbol')}
                placeholder={t('modals.strategy_editor.fields.symbol.placeholder')}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('modals.strategy_editor.fields.mode.label')}</span>
              <select className={styles.select} value={formState.mode} onChange={handleBasicChange('mode')}>
                <option value="live">{t('modals.strategy_editor.mode.live')}</option>
                <option value="paper">{t('modals.strategy_editor.mode.paper')}</option>
                <option value="backtest">{t('modals.strategy_editor.mode.backtest')}</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('modals.strategy_editor.fields.template.label')}</span>
              <div className={styles.templateActions}>
                <select
                  className={styles.select}
                  value={formState.templateId}
                  onChange={handleTemplateChange}
                >
                  <option value="">{t('modals.strategy_editor.template.manual')}</option>
                  {availableTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={onRefreshTemplates}
                  disabled={templatesLoading}
                >
                  {t('modals.strategy_editor.actions.refresh')}
                </button>
                {templatesLoading ? <span className={styles.templateStatus}>{t('modals.strategy_editor.status.loading_templates')}</span> : null}
              </div>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('modals.strategy_editor.fields.file.label')}</span>
              <div className={styles.templateActions}>
                <select
                  className={styles.select}
                  value={selectedFileValue}
                  onChange={handleFileSelectChange}
                >
                  <option value="__new__">{t('modals.strategy_editor.file.create_new')}</option>
                  {files.map((file) => (
                    <option key={file.path} value={file.path}>
                      {file.path}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={onRefreshFiles}
                  disabled={filesLoading}
                >
                  {t('modals.strategy_editor.actions.refresh')}
                </button>
                {filesLoading ? <span className={styles.templateStatus}>{t('modals.strategy_editor.status.loading_files')}</span> : null}
              </div>
              <span className={styles.fileHint}>
                {selectedFileValue === '__new__'
                  ? t('modals.strategy_editor.file_hint.new', { path: strategyFileDisplayPath })
                  : t('modals.strategy_editor.file_hint.selected', { path: strategyFileDisplayPath })}
              </span>
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{t('modals.strategy_editor.fields.description.label')}</span>
            <textarea
              className={styles.textarea}
              value={formState.description}
              onChange={handleBasicChange('description')}
              placeholder={t('modals.strategy_editor.fields.description.placeholder')}
            />
          </label>
          <div className={styles.fieldGrid}>
            <label className={styles.switchGroup}>
              <input
                type="checkbox"
                checked={formState.enabled}
                onChange={handleBasicChange('enabled')}
              />
              <span className={styles.switchLabel}>{t('modals.strategy_editor.switches.enabled')}</span>
            </label>
            <label className={styles.switchGroup}>
              <input
                type="checkbox"
                checked={formState.active}
                onChange={handleBasicChange('active')}
              />
              <span className={styles.switchLabel}>{t('modals.strategy_editor.switches.active')}</span>
            </label>
            <label className={styles.switchGroup}>
              <input
                type="checkbox"
                checked={formState.skipWeekends}
                onChange={handleBasicChange('skipWeekends')}
              />
              <span className={styles.switchLabel}>{t('modals.strategy_editor.switches.skip_weekends')}</span>
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{t('modals.strategy_editor.fields.tags.label')}</span>
            <input
              className={styles.input}
              value={formState.tags}
              onChange={handleBasicChange('tags')}
              placeholder={t('modals.strategy_editor.fields.tags.placeholder')}
            />
            <span className={styles.tagsHint}>{t('modals.strategy_editor.fields.tags.hint')}</span>
          </label>
        </section>

        {isScreener ? (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>{t('modals.strategy_editor.sections.screener.title')}</h3>
              </div>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('modals.strategy_editor.screener.fields.instrument.label')}</span>
                  <FilterCombobox
                    value={formState.screenerInstrument}
                    options={screenerInstrumentOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                      description: option.description ?? undefined
                    }))}
                    placeholder="请选择"
                    onChange={handleScreenerProfileValue('screenerInstrument')}
                  />
                  <span className={styles.fieldTip}>例如：STK</span>
                </label>
                <FieldHelp
                  className={styles.field}
                  label={t('modals.strategy_editor.screener.fields.location.label')}
                  description={locationHelpDescription}
                >
                  <FilterCombobox
                    value={formState.screenerLocation}
                    options={filteredLocationOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                      description: option.description ?? undefined
                    }))}
                    placeholder={
                      screenerInstrumentTokens.length ? '请选择' : '请先选择 Instrument'
                    }
                    onChange={handleScreenerProfileValue('screenerLocation')}
                  />
                  <span className={styles.fieldTip}>例如：STK.US</span>
                </FieldHelp>
                <FieldHelp
                  className={styles.field}
                  label={t('modals.strategy_editor.screener.fields.scan_code.label')}
                  description={scanCodeHelpDescription}
                >
                  <FilterCombobox
                    value={formState.screenerScanCode}
                    options={screenerScanCodeOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                      description: option.description ?? undefined
                    }))}
                    placeholder={
                      screenerInstrumentTokens.length ? '请选择' : '请先选择 Instrument'
                    }
                    onChange={handleScreenerProfileValue('screenerScanCode')}
                  />
                  <span className={styles.fieldTip}>例如：TOP_PERC_GAIN</span>
                </FieldHelp>
                <label className={styles.field}>
                  <span className={styles.label}>{t('modals.strategy_editor.screener.fields.number_of_rows.label')}</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={formState.screenerNumberOfRows}
                    onChange={handleScreenerProfileChange('screenerNumberOfRows')}
                    placeholder={t('modals.strategy_editor.screener.fields.number_of_rows.placeholder')}
                  />
                </label>
              </div>
              <div className={styles.sectionHint}>
                {screenerMetadataStatus === 'loading'
                  ? t('modals.strategy_editor.screener.status.loading')
                  : screenerMetadataStatus === 'failed'
                    ? screenerMetadataError ?? t('modals.strategy_editor.screener.status.failed')
                    : t('modals.strategy_editor.screener.status.ready')}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>{t('modals.strategy_editor.sections.screener_filters.title')}</h3>
                <button type="button" className={styles.addButton} onClick={handleAddScreenerFilter}>
                  {t('modals.strategy_editor.actions.add_filter')}
                </button>
              </div>
              {formState.screenerFilters.length === 0 ? (
                <div className={styles.sectionHint}>{t('modals.strategy_editor.screener_filters.empty')}</div>
              ) : null}
              <div className={styles.filterList}>
                {formState.screenerFilters.map((filter) => {
                  const definition = screenerFilterMap[filter.field] ?? null;
                  const normalizedType = (definition?.type ?? '').toLowerCase();
                  const isBoolean = normalizedType.includes('bool');
                  const isNumber =
                    normalizedType.includes('int') ||
                    normalizedType.includes('float') ||
                    normalizedType.includes('double') ||
                    normalizedType.includes('decimal') ||
                    normalizedType.includes('number');
                  return (
                    <div key={filter.id} className={styles.filterRow}>
                      <div className={styles.filterGrid}>
                        <label className={styles.field}>
                          <span className={styles.label}>{t('modals.strategy_editor.screener_filters.field.label')}</span>
                          <FilterCombobox
                            value={filter.field}
                            options={screenerFilterOptions}
                            placeholder={t('modals.strategy_editor.screener_filters.field.placeholder')}
                            onChange={(value) => {
                              const normalized = value.trim().toLowerCase();
                              const canonical = normalized
                                ? screenerFilterNameMap.get(normalized)
                                : undefined;
                              updateScreenerFilter(filter.id, 'field', canonical ?? value);
                            }}
                          />
                        </label>
                        <label className={styles.field}>
                          <span className={styles.label}>{t('modals.strategy_editor.screener_filters.value.label')}</span>
                          {definition?.options?.length ? (
                            <select
                              className={styles.select}
                              value={filter.value}
                              onChange={handleScreenerFilterChange(filter.id, 'value')}
                            >
                              <option value="">{t('modals.strategy_editor.screener_filters.value.placeholder')}</option>
                              {definition.options.map((option) => (
                                <option key={option.value} value={String(option.value)}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : isBoolean ? (
                            <select
                              className={styles.select}
                              value={filter.value}
                              onChange={handleScreenerFilterChange(filter.id, 'value')}
                            >
                              <option value="">{t('modals.strategy_editor.screener_filters.value.placeholder')}</option>
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          ) : (
                            <input
                              className={styles.input}
                              type={isNumber ? 'number' : 'text'}
                              min={definition?.min ?? undefined}
                              max={definition?.max ?? undefined}
                              step={definition?.step ?? (isNumber ? 'any' : undefined)}
                              value={filter.value}
                              onChange={handleScreenerFilterChange(filter.id, 'value')}
                              placeholder={definition?.description ?? t('modals.strategy_editor.screener_filters.value.placeholder')}
                            />
                          )}
                        </label>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => handleRemoveScreenerFilter(filter.id)}
                        >
                          {t('modals.strategy_editor.actions.remove')}
                        </button>
                      </div>
                      {definition?.description ? (
                        <div className={styles.filterHint}>{definition.description}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>AI 条件生成</h3>
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={handleGenerateScreenerAiConditions}
                  disabled={screenerAiGenerating}
                >
                  {screenerAiGenerating ? '生成中…' : '生成条件'}
                </button>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>自然语言输入（支持粘贴图片）</span>
                <textarea
                  className={styles.textarea}
                  value={screenerAiInput}
                  onChange={(event) => setScreenerAiInput(event.target.value)}
                  onPaste={handleScreenerAiPaste}
                  placeholder="例如：帮我筛选美股，价格大于 20、成交量活跃、近5日涨幅较好的标的。"
                />
              </label>
              <div className={styles.aiUploadRow}>
                <label className={styles.addButton}>
                  上传图片
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className={styles.hiddenInput}
                    onChange={handleScreenerAiImageUpload}
                  />
                </label>
                <span className={styles.fieldTip}>最多 {MAX_SCREENER_AI_IMAGES} 张，支持粘贴截图</span>
              </div>
              {screenerAiImageNames.length ? (
                <div className={styles.aiImageList}>
                  {screenerAiImageNames.map((name, index) => (
                    <div key={`${name}-${index}`} className={styles.aiImageItem}>
                      <span>{name}</span>
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => handleRemoveScreenerAiImage(index)}
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {screenerAiError ? <div className={styles.error}>{screenerAiError}</div> : null}
              <label className={styles.field}>
                <span className={styles.label}>AI 返回内容（流式）</span>
                <textarea
                  className={styles.textarea}
                  value={screenerAiRawResponse}
                  readOnly
                  placeholder="流式返回内容会显示在这里。"
                />
              </label>
              <div className={styles.sectionHeader}>
                <h4 className={styles.sectionTitle}>当日最近 10 条日志</h4>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={() => {
                    void refreshScreenerAiLogs();
                  }}
                  disabled={screenerAiLogsLoading}
                >
                  {screenerAiLogsLoading ? '刷新中…' : '刷新'}
                </button>
              </div>
              {!screenerAiLogs.length ? (
                <div className={styles.sectionHint}>暂无日志</div>
              ) : (
                <div className={styles.aiLogList}>
                  {screenerAiLogs.map((entry) => (
                    <div key={entry.id} className={styles.aiLogItem}>
                      <div className={styles.aiLogMeta}>
                        <span>{entry.timestamp}</span>
                        <span>{entry.status}</span>
                        <span>{entry.duration_ms != null ? `${entry.duration_ms}ms` : '-'}</span>
                      </div>
                      {entry.error ? <div className={styles.aiLogError}>{entry.error}</div> : null}
                      {entry.request_payload ? (
                        <div>
                          <div className={styles.fieldTip}>Request</div>
                          <pre className={styles.aiLogPayload}>
                            {formatJsonPreview(entry.request_payload)}
                          </pre>
                        </div>
                      ) : null}
                      {entry.response_payload ? (
                        <div>
                          <div className={styles.fieldTip}>Response</div>
                          <pre className={styles.aiLogPayload}>
                            {formatJsonPreview(entry.response_payload)}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>{t('modals.strategy_editor.sections.screener_schedule.title')}</h3>
              </div>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('modals.strategy_editor.screener_schedule.mode.label')}</span>
                  <select
                    className={styles.select}
                    value={formState.screenerSchedule.mode}
                    onChange={handleScreenerScheduleChange('mode')}
                  >
                    <option value="manual">{t('modals.strategy_editor.screener_schedule.mode.manual')}</option>
                    <option value="hourly">{t('modals.strategy_editor.screener_schedule.mode.hourly')}</option>
                    <option value="daily">{t('modals.strategy_editor.screener_schedule.mode.daily')}</option>
                    <option value="weekly">{t('modals.strategy_editor.screener_schedule.mode.weekly')}</option>
                    <option value="monthly">{t('modals.strategy_editor.screener_schedule.mode.monthly')}</option>
                  </select>
                </label>
                {formState.screenerSchedule.mode === 'hourly' ? (
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.screener_schedule.minute.label')}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      max={59}
                      value={formState.screenerSchedule.minute}
                      onChange={handleScreenerScheduleChange('minute')}
                      placeholder={t('modals.strategy_editor.screener_schedule.minute.placeholder')}
                    />
                  </label>
                ) : null}
                {formState.screenerSchedule.mode === 'daily' ||
                formState.screenerSchedule.mode === 'weekly' ||
                formState.screenerSchedule.mode === 'monthly' ? (
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.screener_schedule.time.label')}</span>
                    <input
                      className={styles.input}
                      type="time"
                      value={formState.screenerSchedule.time}
                      onChange={handleScreenerScheduleChange('time')}
                    />
                  </label>
                ) : null}
                {formState.screenerSchedule.mode === 'weekly' ? (
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.screener_schedule.weekday.label')}</span>
                    <select
                      className={styles.select}
                      value={formState.screenerSchedule.weekday}
                      onChange={handleScreenerScheduleChange('weekday')}
                    >
                      <option value="mon">{t('modals.strategy_editor.screener_schedule.weekday.mon')}</option>
                      <option value="tue">{t('modals.strategy_editor.screener_schedule.weekday.tue')}</option>
                      <option value="wed">{t('modals.strategy_editor.screener_schedule.weekday.wed')}</option>
                      <option value="thu">{t('modals.strategy_editor.screener_schedule.weekday.thu')}</option>
                      <option value="fri">{t('modals.strategy_editor.screener_schedule.weekday.fri')}</option>
                    </select>
                  </label>
                ) : null}
                {formState.screenerSchedule.mode === 'monthly' ? (
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.screener_schedule.day.label')}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      max={31}
                      value={formState.screenerSchedule.day}
                      onChange={handleScreenerScheduleChange('day')}
                      placeholder={t('modals.strategy_editor.screener_schedule.day.placeholder')}
                    />
                  </label>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>{t('modals.strategy_editor.sections.windows.title')}</h3>
              <button type="button" className={styles.addButton} onClick={handleAddWindow}>
                {t('modals.strategy_editor.actions.add_window')}
              </button>
            </div>
            <div className={styles.windowList}>
              {formState.windows.map((window, index) => (
                <div key={window.id} className={styles.windowRow}>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.fields.window_start.label')}</span>
                    <input
                      className={styles.input}
                      value={window.start}
                      onChange={handleWindowChange(window.id, 'start')}
                      placeholder={t('modals.strategy_editor.fields.window_start.placeholder')}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.fields.window_end.label')}</span>
                    <input
                      className={styles.input}
                      value={window.end}
                      onChange={handleWindowChange(window.id, 'end')}
                      placeholder={t('modals.strategy_editor.fields.window_end.placeholder')}
                    />
                  </label>
                  {formState.windows.length > 1 ? (
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => handleRemoveWindow(window.id)}
                    >
                      {t('modals.strategy_editor.actions.remove')}
                    </button>
                  ) : (
                    <div />
                  )}
                  {index === 0 ? (
                    <span className={styles.sectionHint}>{t('modals.strategy_editor.sections.windows.format_hint')}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}

        {!isScreener ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>{t('modals.strategy_editor.sections.parameters.title')}</h3>
              <button type="button" className={styles.addButton} onClick={handleAddParameter}>
                {t('modals.strategy_editor.actions.add_parameter')}
              </button>
            </div>
            {selectedTemplate && !formState.parameters.length ? (
              <div className={styles.sectionHint}>
                {t('modals.strategy_editor.parameters.template_empty_hint', { name: selectedTemplate.name })}
              </div>
            ) : null}
            <div className={styles.parameterList}>
              {formState.parameters.map((parameter) => (
                <div key={parameter.id} className={styles.parameterCard}>
                  <div className={styles.parameterHeader}>
                    <div>
                      <p className={styles.parameterTitle}>{parameter.label || parameter.name || t('modals.strategy_editor.parameters.default_label')}</p>
                      <p className={styles.parameterMeta}>{parameter.type || t('modals.strategy_editor.parameters.type_unset')}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => handleRemoveParameter(parameter.id)}
                    >
                      {t('modals.strategy_editor.actions.remove')}
                    </button>
                  </div>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.fields.param_name.label')}</span>
                    <input
                      className={styles.input}
                      value={parameter.name}
                      onChange={handleParameterChange(parameter.id, 'name')}
                      placeholder={t('modals.strategy_editor.fields.param_name.placeholder')}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.fields.param_label.label')}</span>
                    <input
                      className={styles.input}
                      value={parameter.label}
                      onChange={handleParameterChange(parameter.id, 'label')}
                      placeholder={t('modals.strategy_editor.fields.param_label.placeholder')}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.fields.param_type.label')}</span>
                    <input
                      className={styles.input}
                      value={parameter.type}
                      onChange={handleParameterChange(parameter.id, 'type')}
                      placeholder={t('modals.strategy_editor.fields.param_type.placeholder')}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.fields.param_value.label')}</span>
                    <input
                      className={styles.input}
                      value={parameter.value}
                      onChange={handleParameterChange(parameter.id, 'value')}
                      placeholder={t('modals.strategy_editor.fields.param_value.placeholder')}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('modals.strategy_editor.fields.param_desc.label')}</span>
                    <textarea
                      className={styles.textarea}
                      value={parameter.description}
                      onChange={handleParameterChange(parameter.id, 'description')}
                      placeholder={t('modals.strategy_editor.fields.param_desc.placeholder')}
                    />
                  </label>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {validationError ? <div className={styles.error}>{validationError}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.footer}>
          <button type="button" className={`${styles.footerButton} ${styles.cancelButton}`} onClick={onClose}>
            {t('modals.common.cancel')}
          </button>
          <button
            type="submit"
            className={`${styles.footerButton} ${styles.submitButton}`}
            disabled={submitting}
          >
            {submitting ? t('modals.strategy_editor.actions.saving') : t('modals.strategy_editor.actions.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default StrategyEditorModal;
