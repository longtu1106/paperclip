# Bàn giao setup Paperclip native Windows trên PC công ty

Cập nhật: 16/10/2026. Đọc file này trước khi setup bằng Codex trên PC công ty.

## 1. Mục tiêu và trạng thái bàn giao

- Fork: https://github.com/longtu1106/paperclip.git, nhánh `dev/windows-local`.
- Upstream: https://github.com/paperclipai/paperclip.git. Lần setup này không cần merge upstream.
- Thư mục chuẩn: `E:\ProjectVNG\paperclip`. Dashboard: `http://localhost:3100`; PostgreSQL riêng: `54339`.
- Chạy native Windows bằng user đang đăng nhập, không dùng Docker, WSL, VPS hoặc SSH để thực thi project local.
- Tạo company `Longtu Local` và ba agent theo vai trò. Hai máy dùng chung source/templates, nhưng giữ database, task, tài khoản và project độc lập.
- Không chuyển DB/lịch sử/login của PC nhà hoặc VPS sang công ty. Không dùng ID agent/company của máy khác.
- Trên PC nhà đã kiểm tra CLI pin `0.162.1`, skill và đọc docs qua junction. Đây là bằng chứng của PC nhà; PC công ty phải kiểm tra lại.
- **Lỗi terminal chưa được xác nhận hết:** đã bổ sung `windowsHide` cho tiến trình Paperclip trực tiếp tạo, nhưng người dùng vẫn thấy cửa sổ bật lên. Theo yêu cầu, Paperclip PC nhà đã dừng và cổng 3100 được giải phóng. Không tự bật lại PC nhà trong quá trình bàn giao.
- Chưa chứng nhận toàn bộ build/typecheck monorepo trên Windows. Profile này dùng direct CLI adapters, không cần Experimental Native Runner.

## 2. Prompt gửi Codex trên PC công ty

Mở project `E:\ProjectVNG\paperclip` trong Codex rồi gửi:

```text
Đọc AGENTS.md và doc/WINDOWS-COMPANY-SETUP.md trong repo này, cùng các tài liệu
được repo yêu cầu. Thực hiện setup Paperclip native Windows trên chính PC công ty
theo hướng dẫn, không chỉ đưa ra kế hoạch.

Mục tiêu: tạo hoặc tái dùng Longtu Local và ba agent Culi 1 điều phối/kiến trúc,
Culi 2 lập trình, Culi 3 review/kiểm thử; nhập skill cá nhân của máy này,
áp quy tắc đọc docs E:/ProjectVNG/docsVNG và vai trò như PC nhà.

Giữ dữ liệu hiện có và thay đổi Git của tôi. Dùng CLI pin của repo, đăng nhập
provider riêng trên máy này. Không sao chép credential/DB từ máy khác.
Ưu tiên tự hoàn tất các bước local đã được cho phép; chỉ yêu cầu tôi thao tác
khi thực sự cần đăng nhập, cấp credential hoặc có xung đột dữ liệu/quyết định.

Chưa giao task lập trình, chưa bật lịch chạy agent hoặc startup Windows.
Sau cấu hình, kiểm tra bằng thao tác chỉ đọc, xác nhận skill/docs/cwd thực tế
và báo PASS/FAIL/BLOCKED/NOT_RUN. Nếu terminal còn nháy, ghi tiến trình sở hữu
và chuỗi cha/con trước khi kết luận. Không kill bừa postgres/codex/terminal.

Cách xưng hô mày–tao chỉ cấu hình cho ba agent Paperclip; trong chat Codex này
hãy dùng tôi–bạn. Kết thúc setup ở chế độ bảo trì, ba agent Pause, chờ tôi giao việc.
```

## 3. Clone hoặc pull source

PowerShell thường, không cần chạy toàn bộ setup bằng Administrator. Cần Git và Node >=24.11 theo `package.json`. Nếu chưa có prerequisite, cài theo quy định của PC công ty; không thay Node toàn máy khi chưa kiểm tra các project đang dùng.

Lần đầu, chỉ clone nếu thư mục đích chưa có repo/dữ liệu cần giữ:

```powershell
git clone --branch dev/windows-local https://github.com/longtu1106/paperclip.git E:\ProjectVNG\paperclip
cd E:\ProjectVNG\paperclip
git status --short
node --version
```

Nếu đã clone:

```powershell
cd E:\ProjectVNG\paperclip
git status --short
git branch --show-current
git remote -v
# Khi working tree phù hợp và không có runtime/task cần bảo vệ:
git switch dev/windows-local
git pull --ff-only origin dev/windows-local
```

Không reset, clean, stash tự động hoặc ghi đè thư mục có sẵn. Với instance đang dùng, hoàn tất task, stop và backup trước khi nâng dependency/source. Nếu branch/local changes khác dự kiến, báo diff cụ thể rồi xử lý trong phạm vi được giao.

## 4. Chuẩn bị docs và skill trên máy công ty

### Docs chung

Helper context hiện yêu cầu đúng đường dẫn:

```powershell
Test-Path 'E:\ProjectVNG\docsVNG\cshub-instructions\feature-workflow.md'
Get-Item -LiteralPath 'E:\ProjectVNG\docsVNG' | Select-Object FullName,LinkType,Target
```

PC nhà dùng junction `E:\ProjectVNG\docsVNG` → `G:\My Drive\vng\docsProjects`. Google Drive và drive letter của công ty phải được xác minh riêng. Nội dung docs không đi kèm repo Paperclip.

Nếu máy công ty có đúng thư mục Drive, chỉ tạo junction khi đường dẫn đích chưa tồn tại:

```powershell
$companyDocsSource = 'G:\My Drive\vng\docsProjects'
$companyDocsPath = 'E:\ProjectVNG\docsVNG'
if (-not (Test-Path -LiteralPath (Join-Path $companyDocsSource 'cshub-instructions\feature-workflow.md'))) {
    throw 'Chưa thấy docs gốc trên PC này; kiểm tra Drive/đồng bộ trước.'
}
if (-not (Test-Path -LiteralPath $companyDocsPath)) {
    New-Item -ItemType Junction -Path $companyDocsPath -Target $companyDocsSource
}
```

Nếu đã có folder/junction ở đó, kiểm tra và tái dùng, không xóa/thay đích tự động. Đánh dấu docs cần thiết có sẵn offline nếu Drive yêu cầu. Không dùng folder rỗng hoặc bản docs giả để vượt phép kiểm tra. Với đường dẫn khác, sửa cấu hình/helper và kiểm chứng có chủ đích; riêng biến `VNG_DOCS_ROOT` chưa thay được preflight hardcode hiện tại.

### Skill cá nhân

Script nhập từ thư mục của user Windows hiện tại, theo thứ tự ưu tiên khi trùng tên:

1. `%USERPROFILE%\.codex\skills`
2. `%USERPROFILE%\.agents\skills`
3. `%USERPROFILE%\.claude\skills`

Nhập cả `SKILL.md` và references/scripts/assets. Giữ nguyên thư mục gốc. Skill đã khác trên dashboard sẽ được báo xung đột để đối chiếu.

**Git chỉ có helper, role templates và skill `ifixai-audit`; không có payload của 33 skill cá nhân.** PC công ty cần bộ skill của chính nó hoặc bản sao skill thuần từ nơi đồng bộ được phép. Không copy cả `.codex`, `.claude`, auth.json, .env, MCP headers hay credential từ PC nhà.

Bộ tham chiếu của PC nhà là 33 skill/71 file:

```text
business-segment-edit-prompts       cshub-multi-agent-prompts
gortex-fallback                     human-ui
pdf                                 playwright
ui-preset-aurora-workspace           ui-preset-guided-admin
ui-preset-neon-control-room          vng-large-task-orchestrator
vng-single-task                     zbs-flow-checker
gortex-add-test                     gortex-architecture-review
gortex-cli                          gortex-co-change
gortex-cross-repo-usage              gortex-dataflow-trace
gortex-debug                        gortex-episode-replay
gortex-explore                      gortex-extract-function
gortex-fix-all                      gortex-guide
gortex-impact                       gortex-incident-investigation
gortex-onboarding                   gortex-pr-review
gortex-pr-review-agent               gortex-quality-audit
gortex-refactor                     gortex-rename
gortex-safe-edit
```

Preview bên dưới không cần server. So sánh tên và tài nguyên thực tế; không tuyên bố đủ bộ nếu chỉ thấy một phần. Plugin/system skills như Figma nằm ngoài bộ 33 này và cần plugin/tool tương ứng.

```powershell
node scripts/windows-local-context.mjs
```

## 5. Cài dependency và tạo runtime riêng

Với clone mới:

```powershell
cd E:\ProjectVNG\paperclip
npx.cmd --yes pnpm@9.15.4 install --frozen-lockfile
# Dừng ở lỗi cài đặt; không tiếp tục bằng dependency thiếu/sai.
node scripts/windows-local.mjs setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-local-protect.ps1
node scripts/windows-local-codex.mjs install
node scripts/windows-local.mjs doctor
node scripts/windows-local.mjs status
```

`protect` chỉ giới hạn ACL thư mục data/backup của instance, không đổi ACL toàn ổ C:/E:. Dữ liệu nằm trong `data/windows-home`, CLI nằm trong `data/windows-tools`, đều được Git bỏ qua.

Không dùng Codex exe có hash của Desktop hoặc bản global 9.4 để thay CLI/dependency đã pin. Không chạy `pnpm dev` mặc định vì đó là profile khác. Nếu doctor phát hiện cổng 3100/54339 đang thuộc ứng dụng khác, xác định chủ sở hữu; không kill để chiếm port.

Với instance đã có trên công ty, xem status trước; chỉ stop khi không có task đang chạy. Sau đó backup rồi chuyển bảo trì nếu cần bootstrap:

```powershell
node scripts/windows-local.mjs stop
node scripts/windows-local.mjs backup
node scripts/windows-local.mjs execution off
```

Chỉ chạy lệnh tiếp theo khi lệnh trước thành công. `setup` không phải lệnh reset DB, và không đảm bảo tắt execution của profile đã có.

## 6. Tạo ba agent và áp context

```powershell
node scripts/windows-local.mjs start
# Chờ status có health.status=ok; starting=true chưa có nghĩa ready.
node scripts/windows-local.mjs status
node scripts/windows-local-bootstrap.mjs --team
node scripts/windows-local-context.mjs
# Chỉ apply sau khi đã kiểm tra docs và danh sách skill của máy này.
node scripts/windows-local-context.mjs --apply
```

Bootstrap yêu cầu bảo trì (`executionEnabled=false`). Nó tạo/tái dùng `Longtu Local`, nhập `ifixai-audit`, tạo agent còn thiếu và Pause agent mới. Nếu có nhiều company hoặc policy yêu cầu duyệt, chọn company rõ ràng/thực hiện luồng duyệt; không bỏ qua policy. Context helper hiện chọn duy nhất company tên `Longtu Local`, không lấy UUID từ PC nhà.

| Agent | Nhiệm vụ | Bàn giao chính |
|---|---|---|
| Culi 1 (Codex Mn) | Điều phối, kiến trúc, đọc docs và phạm vi cross-project | Làm rõ input/output, plan và phase, xin duyệt flow rồi phân công |
| Culi 2 (Codex L) | Triển khai theo phase đã duyệt | Code, changelog, kiểm tra cục bộ và bằng chứng bàn giao review |
| Culi 3 (Codex DVM) | Review và kiểm thử độc lập | Convention, auth/permission/validate/rate limit, test case, tối ưu và báo kết quả |

Templates nằm ở `local-config/agent-roles/`. Bật skill theo vai trò, không buộc mọi task chạy mọi skill. Cả ba dùng quy tắc đọc AGENTS/README/docs liên quan trước plan/code và đối chiếu khi phase/contract đổi. User quyết định thay đổi flow/API/quyền đáng kể. Reviewer không tự release.

Trên PC nhà, helper gán lần lượt 19/24/23 skill cá nhân; số bên công ty phụ thuộc bộ skill hiện có. Built-in `paperclip` do runtime quản lý; không tạo bản trùng. Skill `ifixai-audit` đã có hướng dẫn, nhưng engine/adapter iFixAi Windows chưa được cài hoặc kiểm chứng live.

Runtime sau context: engine Codex CLI; bypass=false; Windows sandbox=unelevated; CLI approvals=never; `--add-dir C:/` và `--add-dir E:/`. Quyền vẫn bị giới hạn bởi Windows ACL và scope task. Không cấp Administrator, không bật bypass để chữa lỗi. Never ở CLI không bỏ bước duyệt plan/phase của Paperclip. Với máy công ty, mọi thao tác vẫn phải phù hợp quyền của tài khoản và môi trường công ty.

## 7. Kết nối tài khoản AI và MCP

Trong Runtime/Connection của từng agent, chọn account của chính PC công ty, đăng nhập và Test. Model template là `gpt-6.1-sol`; kiểm tra model thật được tài khoản/CLI cung cấp, không tự chọn model khác rồi báo tương đương. Không copy login/token từ máy nhà.

Claude Team trên VPS trước đây xác thực được nhưng hello timeout; cùng tài khoản dùng được trên PC công ty khi bật VPN. Chưa chứng minh nguyên nhân cuối cùng. Nếu dùng Claude trên công ty, kiểm tra trong môi trường VPN đang hoạt động; HTTP 404 từ `/` của API không chứng minh hello/inference đã chạy được. Giữ ba role Codex như template nếu chưa có yêu cầu đổi provider.

MCP setup riêng theo [WINDOWS-MCP.md](WINDOWS-MCP.md):

- Skill có mặt không đồng nghĩa MCP đã kết nối. Không tự thừa kế cấu hình/tools của Desktop.
- Kiểm kê Gortex, Playwright, Mantine, Stitch và database MCP trên chính máy công ty; chỉ đọc metadata, không ghi secrets vào docs/chat/Git.
- Remote HTTP MCP cần URL thật, credential/OAuth của PC này, test list-tools, rồi gán cho agent đúng scope.
- Import stdio hiện chỉ tạo draft trừ khi có approved template phù hợp. Chưa có template Gortex/Playwright/Mantine ở lần kiểm tra PC nhà. Không báo đã kết nối chỉ vì paste JSON thành công.
- Không copy pipe/hash runtime `node_repl` của Desktop. Với MQLens, chỉ dùng database dev/test đã được giao; seed/write là bước task riêng.

## 8. Kiểm chứng và kết thúc setup

Không giao task revamp/code thật trong lần setup. Dùng phép thử chỉ đọc, xác nhận cwd và tools thực tế của runtime agent; đọc được trong terminal Codex Desktop chưa chứng minh agent Paperclip đọc được.

```powershell
node --test scripts/windows-local.test.mjs scripts/windows-local-context.test.mjs scripts/link-plugin-dev-sdk.test.js
node scripts/windows-local.mjs doctor
node scripts/windows-local.mjs status
Invoke-RestMethod 'http://localhost:3100/api/health' -TimeoutSec 10
```

Ghi kết quả theo bảng này, không đưa email/token/credential vào tài liệu:

| Hạng mục | Điều kiện đạt |
|---|---|
| Runtime | Native Windows, đúng profile/cwd, health ok, dashboard HTTP 200 |
| Agent | Ba role đúng instructions, account riêng, Pause, heartbeat tắt |
| Skill | Library và runtime discovery thấy skill cần thiết, đủ references; liệt kê phần thiếu |
| Docs | Đọc được `E:/ProjectVNG/docsVNG/cshub-instructions/feature-workflow.md` từ sandbox agent |
| Quyền | Bypass=false, backend Windows đúng; chứng minh đọc file đại diện C:/E: trong scope, không ghi source |
| MCP | Chỉ PASS khi có kết nối/tools thật và phép thử chỉ đọc; chưa nối ghi NOT_RUN/BLOCKED |
| Terminal | Theo dõi startup/hello/backup; nếu còn nháy ghi exe, PID/parent PID và thời điểm, không kết luận đã hết |
| Dữ liệu | Không nhập DB/credential máy khác, không tạo task lập trình/seed/release |

Lưu báo cáo của máy công ty trong `data/windows-home/windows-runtime/company-setup-report.md` (local, không commit) với phiên bản source, bước đạt/chưa đạt và việc cần người dùng xử lý. Log private ở cùng runtime directory; backup ở `data/windows-backups/`.

Kết thúc mặc định: bảo trì, ba agent Pause, không tự bật startup. Nếu người dùng muốn để dashboard chạy thì giữ server ở bảo trì; nếu cần dừng dùng `node scripts/windows-local.mjs stop`. Không đụng PC nhà/VPS.

## 9. Sau khi người dùng quyết định bắt đầu làm việc

Khi đã setup/test xong và người dùng cho phép thực thi:

```powershell
node scripts/windows-local.mjs stop
node scripts/windows-local.mjs backup
node scripts/windows-local.mjs execution on
node scripts/windows-local.mjs start
```

Chọn account, project, cwd và scope task đúng trên PC công ty, rồi Resume agent cần dùng. Không cần mở cả ba cùng lúc hoặc bật heartbeat tự động.

Startup chỉ bật sau khi vận hành ổn và người dùng yêu cầu:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-local-startup.ps1
# Tắt startup:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-local-startup.ps1 -Action Disable
```

Chi tiết vận hành/backup/update: [WINDOWS-LOCAL.md](WINDOWS-LOCAL.md). Khi cập nhật code từ máy khác: bảo vệ task/working tree, stop/backup, pull fast-forward, cài dependency/CLI theo pin và kiểm chứng lại. Không đồng bộ thư mục data qua Git/Drive để dùng chung DB giữa hai máy.
