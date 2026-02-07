export default {
    "common": {
        "loading": "Loading...",
        "loading_app": "Loading UI...",
        "on": "On",
        "off": "Off",
        "boolean": { "yes": "Yes", "no": "No" },
        "unconfigured": "Not configured"
    },
    "topbar": {
        "brand": { "title": "Algo Trader Console" },
        "status": {
            "connected": "WebSocket Connected",
            "connecting": "Connecting",
            "offline": "WebSocket Offline"
        },
        "heartbeat": {
            "prefix": "Last heartbeat:",
            "handshake": "Handshaking",
            "waiting": "Waiting for connection"
        },
        "data": { "error": "Failed to load subscription summary" },
        "buttons": {
            "config": "Config",
            "notifications": "Notifications",
            "logs": "Logs",
            "optimizerPlans": "Optimizer Plans"
        },
        "user": { "guest": "Guest", "role_guest": "Guest Mode" },
        "lang": {
            "switch_to_en": "Switch to English",
            "switch_to_zh": "切换为中文"
        }
    },
    "logs": {
        "modal": {
            "title": "Logs Panel",
            "filters": {
                "module": "Module",
                "range": "Time Range",
                "level": "Log Level",
                "request": "Request ID",
                "search": "Search Text",
                "module_all": "All Modules",
                "level_all": "All",
                "range_options": { "today": "Today", "week": "Past Week", "custom": "Custom" },
                "custom_start": "Start Time",
                "custom_end": "End Time"
            },
            "placeholders": { "request": "Request ID / Trace", "search": "Keyword / Regex" },
            "actions": { "reset": "Reset" },
            "hints": { "auto_refresh": "Filters auto-apply and refresh" },
            "pagination": { "prev": "Previous", "next": "Next" },
            "tail": { "auto_follow": "Auto tail" },
            "status": {
                "failed": "Realtime logs update failed",
                "polling": "Fetching latest logs…",
                "active": "Tailing realtime",
                "loading": "Loading logs…",
                "ready": "Ready"
            },
            "empty": "No log records.",
            "loading": "Loading logs...",
            "meta": {
                "page_info": "Page {{page}} / {{total}}",
                "source_files": "Sources: {{count}} file(s)",
                "source_path": "Source: {{path}}",
                "updated_prefix": "Updated: ",
                "snapshot_prefix": "Snapshot: "
            }
        }
    },
    "route_error": {
        "title": "Unable to load page",
        "default_message": "Page failed to load, please try again later."
    },
    "settings": {
        "refresh": "Refresh",
        "loading_info": "Loading system configuration...",
        "error_load_info": "Failed to load system information",
        "page": {
            "title": "System Configuration",
            "description": "View main application version and downstream service status, and perform necessary configuration checks."
        },
        "kind": {
            "application": "Core Applications",
            "gateway": "Gateway Services",
            "service": "Downstream Services"
        },
        "info": {
            "name": "System Name",
            "version": "Version",
            "debug": "Debug Mode",
            "last_updated": "Last Updated",
            "openapi": "OpenAPI",
            "swagger": "Swagger UI",
            "redoc": "ReDoc"
        },
        "status": {
            "online": "Online",
            "error": "Error",
            "unknown": "Unknown"
        },
        "risk": {
            "title": "Risk Defaults",
            "subtitle": "The following parameters come from backend .env configuration and are used for frontend SL/TP calculations.",
            "stop_loss_ratio": "Stop Loss Ratio",
            "take_profit_ratio": "Take Profit Ratio",
            "price_threshold": "Trigger Threshold",
            "trailing_sl_tp": "Trailing SL/TP",
            "leverage_index": "Index Leverage",
            "leverage_index_micro": "Micro Index Leverage",
            "leverage_es": "ES Leverage",
            "leverage_mes": "MES Leverage",
            "leverage_nq": "NQ Leverage",
            "leverage_mnq": "MNQ Leverage",
            "leverage_ym": "YM Leverage",
            "leverage_mym": "MYM Leverage",
            "leverage_rty": "RTY Leverage",
            "leverage_m2k": "M2K Leverage",
            "leverage_vx": "VX Leverage",
            "cb_daily_r": "Daily Loss Limit (R)",
            "cb_streak": "Consecutive Losses",
            "risk_per_trade_r": "Risk Per Trade (R)",
            "rv_ref_value": "Volatility Reference",
            "rv_ref_method": "Volatility Method",
            "vol_window": "Volatility Window",
            "dd_step": "Drawdown Step",
            "dd_max_steps": "Max Drawdown Steps",
            "dd_scale": "Drawdown Scale",
            "contract_rounding": "Contract Rounding",
            "empty": "Risk defaults not loaded yet. Please check system status and refresh."
        },
        "services": {
            "title": "Downstream Services Status",
            "last_refresh_prefix": "Last refresh:",
            "empty": "No downstream services configured.",
            "table": {
                "name": "Service Name",
                "type": "Type",
                "status": "Status",
                "doc": "Documentation URL",
                "fetched_at": "Fetched At",
                "error": "Error"
            }
        }
    },
    "dashboard": {
        "loading": "Loading dashboard data...",
        "error_load_failed": "Dashboard data failed to load",
        "error_data_missing": "Dashboard data missing",
        "account_warning_prefix": "Account notice:",
        "model_fusion": {
            "title": "Model Fusion Status",
            "loading": "Loading",
            "reload": "Reload",
            "loading_detail": "Loading model fusion overview…",
            "load_failed": "Load failed",
            "no_data": "No data",
            "empty_hint": "No training overview yet; please refresh later.",
            "active_version": "Active version",
            "inactive_model": "No active model",
            "metrics": {
                "fusion_strategy": "Fusion strategy",
                "news_model": "News model",
                "confidence_threshold": "Signal threshold",
                "news_weight": "News weight",
                "unset": "Not set"
            },
            "latest_job": "Latest job",
            "job_type": { "training": "Training", "tuning": "Tuning" },
            "no_jobs": "No jobs",
            "latest_result": "Latest result",
            "no_result": "No result",
            "activation_time": "Activation time"
        },
        "news_summary": {
            "title": "News Sentiment Summary",
            "loading": "Loading",
            "reload": "Reload",
            "loading_detail": "Aggregating news sentiment data…",
            "empty_hint": "No news data yet; please refresh later.",
            "view_details": "View details",
            "active_model": "Active model",
            "inactive": "Inactive",
            "pending_training_jobs": "Pending training jobs",
            "hot_list": "Hot list",
            "no_data": "No data",
            "focus_event": "Focus event",
            "none": "None",
            "untagged": "Untagged",
            "no_realtime_signals": "No realtime signals"
        },
        "account": {
            "title": "Account Summary",
            "actions": {
                "analytics": "Analytics",
                "refresh": "Refresh",
                "view_details": "View Details"
            },
            "labels": {
                "account": "Account",
                "currency": "Currency"
            },
            "metrics": {
                "equity": "Account Equity",
                "balance": "Account Balance",
                "available": "Available Funds",
                "margin_used": "Margin Used",
                "realized_pnl": "Realized PnL",
                "unrealized_pnl": "Unrealized PnL"
            },
            "visibility": {
                "show": "Show Account",
                "hide": "Hide Account"
            },
            "last_updated_prefix": "Last updated:"
        },
        "kline": {
            "title": "Price Candlestick Chart (with Volume)",
            "monitor_paused": "Monitoring paused. Click \u201cMonitor\u201d to reload K-lines and resume realtime subscription.",
            "controls": {
                "hide": "Hide",
                "hide_aria": "Hide panel",
                "risk": "Risk"
            },
            "subscription": {
                "mode_ws": "Realtime Mode: WebSocket Push",
                "connecting": "Connecting market WebSocket…",
                "reconnecting": "Connection lost, reconnecting…",
                "pending_info": "Waiting for subscription {{symbol}}",
                "pending_action": "Subscribing {{symbol}}…",
                "ready_lead": "Realtime subscription active",
                "failed_prefix": "Subscription failed:",
                "failed_hint_default": "Please try again later or contact ops",
                "ws_failed_prefix": "Market WebSocket connection failed",
                "retry_connect": "Retry connection"
            },
            "duration": {
                "1h": "1 hour",
                "3h": "3 hours",
                "1d": "1 day",
                "1w": "1 week",
                "1m": "1 month"
            },
            "timeframe": {
                "1m": "1m",
                "5m": "5m",
                "15m": "15m",
                "1h": "1h"
            },
            "overlay": {
                "latest": "Latest",
                "cost": "Cost"
            },
            "risk": {
                "title": "Risk Rules",
                "enable": "Enable",
                "save": "Save",
                "meta": {
                    "type_prefix": "Type: ",
                    "disabled_suffix": " · Disabled",
                    "none": "No dedicated risk rule configured"
                },
                "type_labels": {
                    "fixed": "Fixed",
                    "trailing": "Trail",
                    "atr_trailing": "ATR Trail"
                },
                "fields": {
                    "stop_loss": "Stop Loss",
                    "take_profit": "Take Profit"
                },
                "summary": {
                    "stop_loss_expectation": "Stop Loss Expectation",
                    "rrr": "RRR",
                    "take_profit_expectation": "Take Profit Expectation"
                }
            },
            "chart": {
                "no_data": "No data",
                "wait_first_tick": "Waiting for first market tick…",
                "aria_label": "Candlestick Chart",
                "y_axis_price": "Price",
                "y_axis_volume": "Volume",
                "tooltip": {
                    "time": "Time: ",
                    "open": "Open: ",
                    "high": "High: ",
                    "low": "Low: ",
                    "close": "Close: ",
                    "volume": "Volume: "
                }
            },
            "footer": {
                "reference": "Reference",
                "high_low": "High / Low",
                "volume": "Volume"
            }
        },
        "positions": {
            "title": "Positions",
            "actions": { "refresh": "Refresh" },
            "empty": "No positions",
            "direction": { "long": "Long", "short": "Short" },
            "labels": {
                "quantity": "Quantity",
                "avg_price": "Avg Price",
                "mark_price": "Mark Price",
                "pnl": "PnL"
            },
            "quick": {
                "close": "Close",
                "closing": "Closing…",
                "reverse": "Reverse",
                "reversing": "Reversing…"
            },
            "configure_risk": "Risk"
        },
        "risk_rules": {
            "title": "Risk Rules",
            "actions": { "refresh": "Refresh", "enable": "Enable", "disable": "Disable" },
            "columns": {
                "symbol": "Symbol",
                "status": "Status",
                "type": "Type",
                "position_limit": "Position Limit",
                "stop_loss_offset": "Stop Loss Offset",
                "take_profit_offset": "Take Profit Offset",
                "trailing_params": "Trailing Params",
                "latest_event": "Latest Event",
                "events_count": "Events",
                "actions": "Actions"
            },
            "global": "Global",
            "status": { "enabled": "Enabled", "disabled": "Disabled" }
        },
        "orders": {
            "title": "Orders",
            "actions": {
                "place_order": "New Order",
                "sync": "Sync",
                "syncing": "Syncing…",
                "refresh": "Refresh"
            },
            "last_sync_prefix": "Last sync:",
            "filter_all": "All",
            "empty": "No orders",
            "card": {
                "status": {
                    "working": "Working",
                    "pending": "Pending",
                    "filled": "Filled",
                    "cancelled": "Cancelled",
                    "rejected": "Rejected",
                    "inactive": "Inactive"
                },
                "side": { "buy": "Buy", "sell": "Sell" },
                "order_type": { "market": "Market" },
                "pnl_prefix": "PnL ",
                "commission_prefix": "Commission ",
                "origin_prefix": "Origin ",
                "origin": {
                    "manual": "Manual",
                    "strategy_prefix": "Strategy",
                    "risk_prefix": "Risk",
                    "risk": { "tp": "Take Profit", "time": "Timed Out", "sl": "Stop Loss" },
                    "auto_stop": {
                        "default": "Auto stop loss",
                        "reason": { "loss_breach": "Loss limit breach" }
                    },
                    "tags": { "reverse_order": "reverse order", "close_order": "close order" }
                },
                "meta": { "last_updated_prefix": "Last updated " },
                "actions": { "cancel": "Cancel", "cancelling": "Cancelling…" },
                "executed_tag": {
                    "today": "Today",
                    "yesterday": "Yesterday",
                    "day_before_yesterday": "The day before",
                    "earlier": "Earlier"
                }
            }
        }
    },
    "documentation": {
        "loading": "Loading API documentation aggregate...",
        "error_load_failed": "Failed to load API documentation aggregate",
        "page": {
            "title": "API Documentation Aggregate",
            "description": "View OpenAPI status and statistics for the main app and downstream services."
        },
        "actions": {
            "refresh": "Refresh",
            "download_json": "Download aggregate JSON"
        },
        "summary": {
            "service_count": "Services",
            "online_count": "Online",
            "path_count": "Paths",
            "operation_count": "Operations",
            "generated_at_prefix": "Generated at:"
        },
        "empty": "No available service documentation",
        "table": {
            "name": "Service",
            "status": "Status",
            "paths": "Paths",
            "operations": "Operations",
            "tags": "Tags",
            "last_synced": "Last synced"
        },
        "buttons": {
            "open_json": "Open OpenAPI JSON"
        },
        "labels": {
            "doc_url_missing": "Documentation URL not configured"
        },
        "error_prefix": "Error:"
    },
    "orders": {
        "page": {
            "title": "Order Management",
            "description": "View and manage real-time orders with filtering, bulk cancel, and status monitoring."
        },
        "actions": {
            "new_order": "New Order",
            "refresh": "Refresh",
            "bulk_cancel": "Bulk Cancel",
            "bulk_cancelling": "Cancelling…"
        },
        "filters": {
            "status": "Order Status",
            "symbol": "Symbol",
            "symbol_placeholder": "e.g., MNQ",
            "source": "Source/Strategy",
            "source_placeholder": "Strategy name or source",
            "include_deleted": "Include deleted",
            "apply": "Apply",
            "reset": "Reset"
        },
        "meta": {
            "last_sync_prefix": "Last sync:",
            "total_prefix": "Total"
        },
        "empty": {
            "loading": "Loading orders…",
            "no_records": "No orders match filters."
        },
        "empty": {
            "loading": "Loading order data…",
            "no_records": "No records match the filters."
        },
        "pagination": {
            "info": "Page {{page}} / {{total}}",
            "prev": "Prev",
            "next": "Next",
            "per_page": "Per page {{size}}"
        },
        "status": {
            "all": "All",
            "working": "Working",
            "pending": "Pending",
            "filled": "Filled",
            "cancelled": "Cancelled",
            "rejected": "Rejected",
            "inactive": "Inactive"
        }
    },
    "strategies": {
        "loading": "Loading strategies...",
        "error_load_failed": "Failed to load strategies",
        "page": {
            "title": "Strategy Management",
            "description": "Manage strategy start/stop, parameters, and real-time metrics. Supports polling fallback."
        },
        "filters": {
            "all": "All"
        },
        "actions": {
            "add": "Add Strategy",
            "edit_current": "Edit Current",
            "refresh_list": "Refresh List",
            "reload_metrics": "Reload Metrics"
        },
        "kline": {
            "summary": {
                "title": "Kline Strategy Overview",
                "labels": {
                    "primary_symbol": "Primary Symbol",
                    "data_feed": "Data Feed",
                    "kline_interval": "Kline Interval",
                    "lookback_window": "Lookback Window",
                    "aggregation": "Aggregation",
                    "trading_window": "Trading Window",
                    "timezone": "Timezone",
                    "description": "Strategy Description"
                },
                "placeholders": { "symbol": "e.g., MNQ" },
                "fallback": {
                    "default_all_day": "Default: all day",
                    "market_data_feed": "Market Data Feed",
                    "description_none": "No description"
                },
                "actions": {
                    "edit": "Edit",
                    "edit_symbol_aria": "Edit primary symbol"
                },
                "optimizer": {
                    "saved_with_path": "Optimizer output saved: {{path}}",
                    "saved": "Optimizer output saved"
                }
            }
        },
        "runtime": {
            "common": {
                "awaiting_text": "Awaiting {{label}} data…",
                "awaiting_hint": "Awaiting {{label}} data…",
                "last_data_timestamp": "Last {{label}} {{timestamp}}",
                "not_enabled": "Not enabled"
            },
            "ui": {
                "title": "Runtime Metrics",
                "status_prefix": "Status:",
                "last_refresh_prefix": "Last refresh:",
                "refresh": "Refresh",
                "refreshing": "Refreshing…",
                "refreshing_hint": "Refreshing; metrics may be delayed.",
                "last_run_label": "Last run",
                "empty_hint": "No runtime info",
                "empty_body": "No runtime info for now"
            },
            "kline": {
                "phases": {
                    "subscription": "Subscription",
                    "batch_aggregation": "Batch Aggregation",
                    "signal_generation": "Signal Generation",
                    "order_execution": "Order Execution"
                }
            },
            "dynamic_orb": {
                "stage_cache_title": "Stage Progress",
                "stage_status": {
                    "complete": "Complete",
                    "pending": "Building",
                    "disabled": "Disabled",
                    "unknown": "Pending"
                },
                "metrics": {
                    "atr_ratio": "ATR Ratio",
                    "volume_ratio": "Volume Ratio",
                    "breakout_up": "Breakout ↑",
                    "breakout_down": "Breakout ↓",
                    "retest": "Retests",
                    "failures": "Failures"
                },
                "stage_minutes_suffix": "{{minutes}}m",
                "todays_trades_title": "Today's Trades",
                "todays_trades": {
                    "wins_label": "Wins {{count}}",
                    "losses_label": "Losses {{count}}",
                    "breakout_up": "Breakout Up",
                    "breakout_down": "Breakout Down",
                    "retest": "Retest Plays",
                    "total": "Total"
                },
                "win_rate_title": "Win Rate",
                "win_rate": {
                    "breakout": "Breakout Win Rate",
                    "retest": "Retest Win Rate",
                    "overall": "Overall Win Rate"
                },
                "empty": "No ORB stage telemetry yet."
            }
        }
    },
    "dashboard_strategies": {
        "title": "Strategies",
        "actions": { "add": "Add", "refresh": "Refresh" },
        "empty": "No strategies yet; click Add to create.",
        "card": {
            "status": { "running": "Running", "stopped": "Stopped", "error": "Error", "starting": "Starting" },
            "mode": { "live": "Live", "paper": "Paper", "backtest": "Backtest" },
            "metrics": { "daily_pnl": "Daily PnL", "daily_commission": "Daily Commission", "daily_trades": "Daily Trades" },
            "actions": { "edit": "Edit", "start": "Start", "stop": "Stop" }
        }
    },
    "modals": {
        "common": {
            "cancel": "Cancel",
            "close": "Close",
            "save": "Save",
            "saving": "Saving…"
        },
        "configuration": {
            "title": "Configuration Center",
            "subtitle": "Manage system config, downstream services and live connections",
            "system": {
                "title": "System Information",
                "last_refresh_prefix": "Last refresh:",
                "services_refresh_prefix": "Services refresh:"
            },
            "risk": {
                "title": "Risk Default Configuration",
                "subtitle": "Sync backend .env risk parameters for frontend calculations.",
                "empty": "Failed to load risk defaults. Please check backend config and refresh."
            }
        },
        "strategy_detail": {
            "title": "Strategy Detail",
            "title_with_name": "Strategy Detail · {{name}}",
            "confirm_delete": "Confirm delete strategy {{name}}? This cannot be undone.",
            "actions": {
                "delete": "Delete",
                "delete_aria": "Delete strategy {{name}}",
                "delete_aria_generic": "Delete strategy"
            }
        },
        "order_entry": {
            "title": "Place Order",
            "subtitle": "Fill order details",
            "basic": {
                "title": "Basic Information",
                "subtitle": "Select side, type, and pricing fields"
            },
            "fields": {
                "symbol": { "label": "Instrument" },
                "side": { "label": "Order Side" },
                "type": { "label": "Order Type" },
                "quantity": { "label": "Quantity" },
                "limit_price": { "label": "Limit Price" },
                "stop_price": { "label": "Stop Price" },
                "tag": { "label": "Tags", "placeholder": "Tags for filtering or analytics" },
                "comment": { "label": "Comment", "placeholder": "Additional context for the order" },
                "transmit": { "label": "Transmit immediately to trading channel" }
            },
            "side": { "buy": "Buy", "sell": "Sell" },
            "type": { "limit": "Limit", "market": "Market", "stop": "Stop" },
            "select_symbol_placeholder": "Select or enter symbol",
            "market": { "loading": "Loading latest market data..." },
            "chart": {
                "no_data": "No market data",
                "no_symbol_hint": "Select a symbol to view prices"
            },
            "summary": {
                "title": "Order Summary",
                "contract": "Contract",
                "security_type": "Security Type",
                "side": "Side",
                "order_type": "Type",
                "rows": {
                    "quantity": "Quantity",
                    "price": "Price",
                    "market_exec": "Execute at market",
                    "notional": "Notional",
                    "spread_risk": "Spread risk"
                },
                "hint_label": "Risk Hint",
                "hint_text": "Verify risk rules and positions before submitting."
            },
            "footer": { "meta": "Order will be submitted to trading service" },
            "actions": { "submitting": "Submitting…", "submit": "Submit" }
        },
        "order_detail": {
            "title": "Order Detail",
            "title_with_id": "Order Detail · {{id}}",
            "subtitle": "View full parameters, fills and origin",
            "summary": {
                "contract": "Contract",
                "side_type": "Side / Type",
                "quantity_filled_remaining": "Qty / Filled / Remaining",
                "limit_price": "Limit Price",
                "fill_price": "Fill Price",
                "status": "Status",
                "pnl": "PnL",
                "realized_unrealized": "Realized / Unrealized",
                "commission": "Commission",
                "rejection_reason": "Rejection Reason",
                "origin": "Origin",
                "strategy_rule": "Strategy / Rule",
                "exchange_security_type": "Exchange / Sec Type",
                "account": "Account",
                "ib_order_id": "IB Order ID",
                "client_order_id": "Client Order ID",
                "parent_order_id": "Parent Order ID",
                "created_at": "Created At",
                "executed_at": "Executed At",
                "updated_at": "Updated At"
            },
            "raw_section_title": "Database Fields",
            "market_label": "Market"
        },
        "volatility": {
            "labels": {
                "low": "Low Volatility",
                "normal": "Normal Volatility",
                "high": "High Volatility"
            },
            "desc": {
                "low": "Calm market phase",
                "normal": "Typical volatility range",
                "high": "Turbulent phase"
            }
        },
        "disabled_regimes": {
            "title": "Edit \u201c{{parameter}}\u201d",
            "subtitle": "Select volatility regimes to disable",
            "empty_tag_hint": "No regimes disabled"
        },
        "volatility_multipliers": {
            "title": "Edit \u201c{{parameter}}\u201d",
            "subtitle": "Set multipliers per volatility regime",
            "validation": {
                "invalid_number": "Please enter valid numbers for all regimes"
            }
        },
        "strategy_editor": {
            "title_edit": "Edit Strategy",
            "title_new": "Create Strategy",
            "sections": {
                "basic": { "title": "Basic Info" },
                "windows": { "title": "Trading Windows", "format_hint": "Time format: HH:mm or HH:mm:ss" },
                "parameters": { "title": "Parameters" }
            },
            "fields": {
                "name": { "label": "Strategy Name", "placeholder": "e.g., Trend Strategy A" },
                "symbol": { "label": "Instrument", "placeholder": "e.g., MNQ" },
                "mode": { "label": "Run Mode" },
                "template": { "label": "Strategy Template" },
                "file": { "label": "Strategy File" },
                "description": { "label": "Description", "placeholder": "Briefly describe logic and risk" },
                "tags": { "label": "Tags", "placeholder": "Comma-separated, e.g., trend,scalping", "hint": "Tags are used for filtering and analytics; optional." },
                "window_start": { "label": "Start Time", "placeholder": "09:30" },
                "window_end": { "label": "End Time", "placeholder": "16:00" },
                "param_name": { "label": "Name", "placeholder": "Parameter identifier" },
                "param_label": { "label": "Display Name", "placeholder": "UI display name" },
                "param_type": { "label": "Type", "placeholder": "e.g., number / string / boolean" },
                "param_value": { "label": "Value", "placeholder": "Enter parameter value" },
                "param_desc": { "label": "Description", "placeholder": "Explain parameter usage" }
            },
            "mode": { "live": "Live", "paper": "Paper", "backtest": "Backtest" },
            "template": { "manual": "Manual configuration" },
            "actions": { "refresh": "Refresh", "add_window": "Add Window", "remove": "Remove", "add_parameter": "Add Parameter", "save": "Save", "saving": "Saving…" },
            "status": { "loading_templates": "Loading templates...", "loading_files": "Loading files..." },
            "file": { "create_new": "Create New File" },
            "file_hint": { "new": "Will create: {{path}}", "selected": "Selected: {{path}}" },
            "switches": { "enabled": "Enable Strategy", "active": "Activate immediately", "skip_weekends": "Pause on weekends" },
            "parameters": {
                "template_empty_hint": "Template {{name}} provides no editable params; add as needed.",
                "default_label": "Parameter",
                "type_unset": "Type not specified"
            }
        },
        "account_analytics": {
            "title": "Account Analytics",
            "chart_aria_label": "Equity and PnL trends",
            "empty": "No analytics data available.",
            "legend": { "equity": "Equity", "pnl": "PnL" },
            "range": {
                "1m": "1 month",
                "3m": "3 months",
                "1y": "1 year"
            },
            "axis": {
                "equity": "Equity ({{currency}})",
                "pnl": "PnL ({{currency}})"
            },
            "metrics": {
                "equity_change": "Equity change over period",
                "pnl_change": "Cumulative PnL over period",
                "avg_daily_pnl": "Average daily PnL",
                "max_drawdown": "Max drawdown",
                "max_drawdown_hint": "Estimated from equity time series",
                "avg_daily_pnl_delta": {
                    "1m": "Estimated from last 1 month",
                    "3m": "Estimated from last 3 months",
                    "1y": "Estimated from last 1 year"
                }
            }
        }
    },
    "risk_rules": {
        "loading": "Loading risk rules and metrics...",
        "page": {
            "title": "Risk Rules",
            "description": "Maintain stop-loss/take-profit and position controls for instruments."
        },
        "actions": {
            "add_rule": "Add Rule",
            "bulk_import": "Bulk Import"
        }
    }
}
;