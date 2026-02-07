# Algo Trader 主程序前端

本目录包含主程序前端单页应用（SPA）的框架代码，采用 React + TypeScript + Vite 构建。

## 快速开始

```bash
cd frontend
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`，并与主程序后端通过 REST 与 WebSocket 交互（待后续联调）。若未显式配置 `VITE_API_BASE_URL`，前端会默认使用**当前页面所在的同源地址**来发起接口请求。

要在本地开发或部署时覆盖默认后端地址，可通过下列任意方式指定 `VITE_API_BASE_URL`（以及可选的 `VITE_WS_URL`）：

1. **`.env` 文件**：在 `frontend/` 目录创建 `.env.local` 或 `.env.development.local` 并写入（可参考仓库自带的 `.env.example`）：

   ```ini
   VITE_API_BASE_URL=https://your-backend-host.example/api
   VITE_WS_URL=wss://your-backend-host.example/ws
   ```

   重新启动 `npm run dev` 后生效。

2. **命令行环境变量**：在启动脚本前临时导出，例如：

   ```bash
   VITE_API_BASE_URL="https://api.example.com" VITE_WS_URL="wss://api.example.com/ws" npm run dev
   ```

3. **Docker/CI 构建参数**：构建容器镜像时通过 `--build-arg` 传入，或在 `docker-compose.yml` 中设置 `environment` 字段。仓库的 Compose 文件已经示例配置为 `http://backend:8000`。

前端会在运行时读取这些值，并用于生成所有 REST 与 WebSocket 请求地址。

也可以使用仓库根目录提供的辅助脚本：

```bash
./scripts/run/frontend.sh dev
```

脚本会在缺少依赖时自动执行 `npm install`，并将 Vite 以 `0.0.0.0` 绑定运行，方便与 Docker Compose 联调。

## 脚本

- `npm run dev`：启动 Vite 开发服务器。
- `npm run build`：执行 TypeScript 编译并产出生产构建。
- `npm run preview`：预览生产构建结果。
- `npm run lint`：使用 ESLint 校验 `src/` 目录下的 TypeScript/JSX 代码。
- `npm run check`：串行执行 `lint` 与 `build`，常用于 CI 校验。

在仓库根目录可以通过 `./scripts/run/frontend.sh` 调用上述命令：

```bash
./scripts/run/frontend.sh lint
./scripts/run/frontend.sh check
```

支持的子命令包括 `install`、`dev`、`build`、`preview`、`lint` 与 `check`，可通过 `./scripts/run/frontend.sh --help` 查看说明。

## 目录结构

```
frontend/
├── index.html          # Vite 入口模板
├── package.json        # 前端依赖与脚本
├── src/
│   ├── App.tsx         # 应用根组件
│   ├── main.tsx        # React 渲染入口
│   ├── components/     # 布局与导航组件
│   ├── pages/          # 路由页面与页面级组件
│   ├── router/         # 路由配置（React Router v6）
│   ├── store/          # Redux Toolkit 状态管理基线
│   └── styles/         # 全局样式与变量
└── tsconfig*.json      # TypeScript 配置
```

## 视觉与配色规范（2024-06-14）

- 默认主题采用浅色底、深色文字：面板、表单、列表均以 `var(--color-surface)` 为背景，文字颜色使用 `var(--color-text-primary)`/`--color-text-secondary`。
- 高亮态使用主题变量的柔和版本（如 `var(--color-primary-soft)` 或透明度为 16% 左右的主色阴影），避免使用半透明黑色覆盖层。
- 操作按钮、表单输入等交互控件在聚焦/悬停时以 `var(--color-primary)` 及 `var(--color-surface-hover)` 呈现反馈，保持与 Optimizer 页面一致的视觉层级。
- 新增/修改组件时请复用 `PanelCard`、`PageHeader` 与 Optimizer 表单中抽象的浅色样式，确保整站遵循浅底深字规范。

## 仪表盘核心组件（2024-04-30）

- `src/features/dashboard/` 下新增账户概览、持仓、订单、风险规则、策略、通知、行情图表及 DOM 深度等模块化组件，配合 `dashboardMockData` 提供静态数据以支撑原型展示。
- 统一使用 `PanelCard` 搭配浅色主题样式，体现正式界面布局：左侧资产/订单，中部行情图表与深度，右侧风险与策略控制区。
- `TopBar` 扩展 WebSocket 状态、快捷操作入口与用户信息，为后续接入实时数据和权限控制预留空间。

## 状态管理与数据流（2024-05-01）

- 基于 Redux Toolkit 建立 `auth`、`account`、`orders`、`risk`、`strategies`、`notifications`、`market`、`realtime` 等切片，由 `initializeDashboard` 异步流程汇聚 mock API 快照并初始化各面板。
- 引入 `MockRealtimeClient` 模拟 WebSocket 推送，定期刷新账户盈亏、订单进度、盘口深度及策略绩效，并同步通知中心与心跳状态，验证数据流闭环。
- 页面组件通过 `useAppSelector`/`useAppDispatch` 访问 store，`TopBar`、`SymbolToolbar`、`NotificationFeed` 等部件已与全局状态联动，可演示登录后实时界面行为。

## 下一步

- 封装实际 REST/GraphQL/WS 客户端替换 mock，实现与主程序后台的联调。
- 补充单元测试与端到端测试脚本，覆盖关键数据流与交互逻辑。
- 搭建 CI 工作流，在容器镜像构建前自动执行 `npm run check` 保障质量。

## 容器化部署

项目内置 `frontend/Dockerfile`，使用多阶段构建将产物交付给 Nginx 静态服务器，可在仓库根目录执行：

```bash
docker build -t algo-trader-frontend:latest frontend
docker run -p 5173:80 algo-trader-frontend:latest
```

若需要自定义后端接口地址，可在构建阶段传入 `--build-arg VITE_API_BASE_URL=<http-url>` 与 `--build-arg VITE_WS_URL=<ws-url>`。

使用 `docker compose up -d frontend backend` 可一键启动后端与前端容器，前端默认监听 `http://localhost:5173`。
