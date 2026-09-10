# OwlDesk 服务器部署文档（香港 VPS 版）

> 目标：部署到自有香港服务器，绑域名 + HTTPS，15 分钟巡检 7×24 常驻。
> 本文档替代原 Vercel 方案。架构回顾：Next.js 全栈单体（前后端同进程），JSON 文件存储，单端口（本机约定 **3119**，仅回环，公网走 Nginx 443）。
>
> **为什么服务器方案更简单**：Vercel 方案的两个最重步骤——存储迁移 Upstash（serverless 文件系统只读）和 CF Worker 外部定时器（Hobby cron 降级为每天一次）——在常驻进程 + 持久磁盘上**整个消失**。昨晚本地整夜试跑（85 次调度零失败）就是生产形态的直接验证。

| 原 Vercel 方案的痛点 | 服务器方案 |
|---|---|
| Step 0 存储迁移 Upstash（阻塞项） | 不需要：`data/store.json` 直接持久化 |
| Step 2 CF Worker 定时器 | 不需要：pm2 挂 `overnight-patrol.mjs`（已验证） |
| 函数 60s maxDuration（巡检实测 52s） | 无限制 |
| 实例间 cache 陈旧读 | 单进程，无此问题 |
| *.vercel.app 国内不稳 | 自有域名 + CF 代理，国内外都稳 |

## 总览（按顺序执行）

| 步骤 | 内容 | 耗时 |
|---|---|---|
| 0 | 前置：推送 GitHub + 服务器网络验证 | 10 min |
| 1 | 服务器初始化 + 部署代码 | 15 min |
| 2 | pm2 双进程（web + 巡检） | 5 min |
| 3 | 域名 + HTTPS + 防火墙 | 20 min |
| 4 | 验证清单 + 数据种子 | 15 min |
| 5 | 更新/备份例程 | — |

---

## Step 0：前置条件

### 0.1 服务器要求

- Linux（Ubuntu 22.04+ / Debian 12+ 均可），**1GB RAM 足够**（Next.js 常驻 ~200MB）
- 可 SSH，可开放 80/443 端口
- **时区无所谓**：巡检窗口用 `America/New_York` 显式计算；driver 的晨报时点（04:20/07:25）按服务器本地时间——HK 是 UTC+8 与北京一致，**脚本不用改**

### 0.2 推送代码到 GitHub（当前仓库只有本地 commit！）

远端 `TimLiuDream/OwlDesk` 还是空的，所有提交都在本地。部署前必须：

```bash
git push -u origin main
```

### 0.3 服务器出站网络验证（决定成败的一步）

SSH 到服务器，三个依赖必须全通：

```bash
# Bitget 行情 API（核心数据源）→ 期望 200
curl -s -o /dev/null -w "bitget: %{http_code}\n" "https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT"
# LLM 代理 → 期望 200
curl -s -o /dev/null -w "llm: %{http_code}\n" https://cavoti.com/v1/models -H "Authorization: Bearer $LLM_KEY"
# signal MCP → 期望 200
curl -s -o /dev/null -w "signal: %{http_code}\n" -X POST https://datahub.noxiaohao.com/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

HK 机房三项通常全绿。任何一项不通，先解决网络再部署。

---

## Step 1：服务器初始化与部署

### 1.1 基础环境

```bash
# Node 20+（NodeSource 官方源）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # 应 ≥ v20

# pm2 进程管理
sudo npm i -g pm2
```

### 1.2 拉代码 + 构建

```bash
git clone https://github.com/TimLiuDream/OwlDesk.git ~/OwlDesk
cd ~/OwlDesk
npm ci
npm run build
```

### 1.3 配置 `.env`

从本地把 `.env` 拷过去（**绝不进 git**）：

```bash
# 本地执行：
scp .env user@server:~/OwlDesk/.env
```

变量清单（与本地一致，无新增）：

| 变量 | 必填 | 说明 |
|---|---|---|
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | ✅ | OpenAI 兼容端点（cavoti / 任意） |
| `BITGET_DEMO_API_KEY` / `SECRET` / `PASSPHRASE` | ✅ | 模拟盘三件套 |
| `SIGNAL_MCP_URL` | ✅ | `https://datahub.noxiaohao.com/mcp` |
| `WATCHLIST_SEED` | ✅ | `RTSLAUSDT,RNVDAUSDT,RAAPLUSDT,RMSFTUSDT,RMETAUSDT` |
| `CRON_SECRET` | ✅ **必设** | 巡检接口 Bearer 鉴权；服务器上接口公网可达，不设等于裸奔 |
| `DEMO_EQUITY_USDT` | 可选 | 风控演示权益，默认 50000 |

### 1.4 数据种子（可选，建议做）

昨夜试跑的真实事件 + 晨报直接在本地 `data/store.json`，整文件拷过去即可（无需任何数据库）：

```bash
# 本地执行：
scp data/store.json user@server:~/OwlDesk/data/store.json
```

评审打开线上首页就能看到真实的隔夜数据，而不是空库。

---

## Step 2：pm2 双进程

仓库已带 `ecosystem.config.cjs`（web + patrol driver 两个进程）：

```bash
cd ~/OwlDesk
mkdir -p logs data          # 全新 clone 没有这两个运行时目录
pm2 start ecosystem.config.cjs
pm2 save            # 保存进程列表
pm2 startup         # 按提示执行输出的命令 → 开机自启
pm2 logs --lines 20 # 看启动日志
```

- `owldesk-web`：`next start -H 127.0.0.1 -p 3119`（**3119 是约定端口**，服务器上 3000/3001 等已被其他服务占用；只绑回环，公网入口交给 Nginx，见 Step 3）
- `owldesk-patrol`：`scripts/overnight-patrol.mjs`，每 15 分钟打 `127.0.0.1:3119/api/cron/patrol`（接口自带美股时段门禁），04:20/07:25 生成晨报——与本地夜跑完全一致。driver 通过 `--env-file=.env` 读取 `CRON_SECRET` 并自动携带 `Authorization: Bearer`（服务器必设 secret，本地留空则跳过鉴权，两边兼容）
- **本地那台机器的 driver 记得停掉**（任务管理器结束 node 进程），避免双份事件写各自的库

---

## Step 3：域名 + HTTPS（复用现有 CF Origin 证书体系）

> 服务器现状：`square.timliu.xyz` 已用「CF 橙云代理 + Nginx 443 + CF Origin CA 证书」模式在跑。OwlDesk 照搬同一模式，加一个子域和一个 server block 即可，**不需要 certbot、不需要新证书体系**。
>
> ⚠️ CF Origin CA 证书**只在橙云（Proxied）下有效**——灰云直连时浏览器会拒绝它（非公共信任链）。新子域的 DNS 记录必须开橙云。

### 3.1 确认证书覆盖范围

```bash
openssl x509 -in /etc/ssl/cloudflare/origin.pem -noout -text | grep -A1 "Subject Alternative Name"
```

- 输出含 `*.timliu.xyz` 或 `owldesk.timliu.xyz` → 直接复用这对 pem/key
- 只含 `square.timliu.xyz` → 去 CF 控制台再签一张 Origin Cert（SSL/TLS → Origin Server → Create Certificate，主机名填 `owldesk.timliu.xyz` 或 `*.timliu.xyz`，15 年有效期），存为 `/etc/ssl/cloudflare/owldesk.pem` / `owldesk.key`

### 3.2 Cloudflare DNS

CF → 你的域 → DNS → Add record：

- Type: `A` · Name: `owldesk` · Target: 服务器 IP · **Proxy status: Proxied（橙云）** ← 必须
- SSL/TLS 加密模式保持与 square 站一致（用了 Origin CA 证书则应为 **Full (strict)**）

### 3.3 Nginx server block

新建 `/etc/nginx/sites-available/owldesk.conf`（软链到 sites-enabled），与 square 站同构，仅端口/域名不同：

```nginx
server {
    listen 80;
    server_name owldesk.timliu.xyz;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name owldesk.timliu.xyz;

    ssl_certificate     /etc/ssl/cloudflare/origin.pem;   # 或 owldesk.pem（见 3.1）
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;   # 或 owldesk.key
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 20m;

    # SSE（聊天流式）专用：必须关缓冲，否则整段卡顿
    location /api/chat {
        proxy_pass http://127.0.0.1:3119;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3119;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;   # 巡检实测 ~52s，留余量
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/owldesk.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3.4 防火墙

80/443 已因 square 站开放，无需改动。**3119 不要对外开放**（web 只绑 127.0.0.1，Nginx 反代）；确认 ufw 没有放行 3119 即可。

### 3.5 CF 橙云的附带注意项

- **WebSocket/长连接**：CF 代理默认支持 SSE，无需额外配置
- **100 秒限制**：CF 橙云对单个请求有 100s 上限——巡检 ~52s、聊天单轮 ~60s 都在限内；`proxy_read_timeout 300s` 只是 Nginx 侧余量，真正封顶是 CF 的 100s（当前所有接口都够用，记录在案）
- 国内访问橙云节点通常可达（比 *.vercel.app 稳），评委侧风险低

---

## Step 4：部署后验证清单

全部在正式域名上执行：

- [ ] **首页晨报**：`https://owldesk.timliu.xyz/` 打开，晨报卡片渲染（首次懒生成等几秒）；若做了数据种子，应看到昨夜真实事件
- [ ] **巡检鉴权**：
  ```bash
  curl -X POST https://owldesk.timliu.xyz/api/cron/patrol -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d '{"force":true}'
  # 盘中返回 eventsAdded；盘外返回 skipped。不带 token → 必须 401
  ```
- [ ] **聊天 SSE**：问「RTSLAUSDT 现在多少钱」，流式输出 + 工具 chips + markdown 渲染正常（Nginx 的 `proxy_buffering off` 生效则无整段卡顿）
- [ ] **拟单签字全流程**：「帮我拟个单：BTCUSDT 市价买 0.0002」→ 计划卡 + 风险标注 → 签字 → 状态 submitted + **真实模拟盘 orderId**；再试「TSLA 跌破 300 买 10 股」→ rToken 走桌台模拟（demo- 引用）
- [ ] **信号源复测**（TODO T0.4）：问「现在市场情绪如何」，看工具返回是 `mcp`（HK 出口可能比本地好，RSS 或已恢复）还是降级 `demo`
- [ ] **pm2 自愈**：`pm2 restart owldesk-web` 后页面正常；`sudo reboot` 后两进程自动回来（`pm2 save` + startup 生效）
- [ ] **driver 日志**：`pm2 logs owldesk-patrol --lines 10`，15 分钟一条 patrol 200

---

## Step 5：日常更新与备份

**更新代码**（黑客松期间会频繁迭代）：

```bash
cd ~/OwlDesk && git pull && npm ci && npm run build && pm2 reload ecosystem.config.cjs
```

**数据备份**（评审前保平安，一条 crontab）：

```bash
crontab -e
# 每天 08:00 备份 store.json（保留 7 天）
0 8 * * * cp ~/OwlDesk/data/store.json ~/OwlDesk/data/store.$(date +\%u).json
```

**日志轮转**：`pm2 install pm2-logrotate`（默认配置即可）。

---

## 风险与已知事项

| 风险 | 影响 | 处置 |
|---|---|---|
| 写接口（拟单/签字/丢弃）公网无鉴权 | 任何人可刷草稿并签字（仅模拟盘，无资金风险，但污染审计 + 耗 Demo Key 配额） | 短期可接受（X 帖子引流后留意）；要收紧就加 `WRITE_TOKEN` 环境变量校验，10 分钟工作量 |
| 未设 CRON_SECRET | 巡检接口可被任何人触发 | Step 1.3 标了必设；验证清单含 401 测试 |
| 服务器单点 | 挂了 = 演示挂了 | pm2 自动重启 + 开机自启；**别卡 9/20 才部署**，建议 9/12 前上线跑几天 |
| LLM 代理 HK 出口表现未验证 | 晨报/聊天降级 | Step 0.3 已含 curl 验证；provider.ts 有熔断重试；真不行换直连端点（改两行 env） |
| 巡检单次 ~52s | 无（服务器无时长限制） | Nginx `proxy_read_timeout 120s` 已留余量；想提速可把 news/sentiment 改并行 |
| store.json 并发写 | 单进程写锁已覆盖 | 不要同时跑两个 web 进程 |

## 提交物对照（黑客松表单）

- 部署链接：`https://owldesk.timliu.xyz`（不要裸 IP / 不要 http）
- Agent Hub 使用证明：线上晨报页（行情来自 market 模块）+ 签字后真实 orderId 截图 + 服务器 `pm2 logs` 巡检记录
- 录屏脚本：打开晨报 → 追问 → 拟单 → 签字 → 模拟盘订单确认，≤90s
