# 航图 · dsh-chart

中文 | [English](README.md)

一个 DeepSeek Harness 插件：**把一次真实会话，整理成一份可以重复使用的技能。**

一次对话就像走过的一条路：哪些命令真的跑通了，哪个文件最后修好了问题，哪条验证证明它没错，哪一步是白走的。平时这些都随聊天记录一起滚走了。航图把它们从会话日志里捡出来，写成一份标准的 `SKILL.md`，也就是 DSH 以后能直接加载的技能文件。

不额外调用模型，不猜内容。草稿里的每一条，都能对应回那次会话里的一条事件。

## 装上之后会看到什么

打开任意一个聊过天的会话，顶部会多出一个 **航图** 标签。页面分两半：左边是这次会话留下的证据，右边是技能草稿。

### 七个数字

对话轮次、可用步骤、验证命令、失败记录、改动文件、命令总数、原始事件。

全部从日志里数出来，没有估算值。

### 会话里找到了什么

- **目标** —— 第一句话里你要做的事，另附会话标题和代理预设。
- **步骤** —— 真正执行成功的命令，按先后顺序。`cd`、`ls`、`pwd` 这类打杂命令会被去掉，重复的合并，每一行都写着来自第几轮。默认最多保留 30 条。
- **验证** —— 测试、lint、类型检查、构建、端到端，以及确认接口或远端可达的 `curl`、`git ls-remote` 这类命令。只有真的成功了才放进来，而且必须是整条命令的每一段都在做验证（`npm run lint && tsc --noEmit` 算，`rm -rf dist && npm test` 不算）。
- **改过的文件** —— 只统计编辑或写入成功的文件，并注明改了几次。
- **踩过的坑** —— 失败过的命令、当时的报错，以及后来有没有重试成功。如果一直没成功，草稿会直说，不会假装修好了。
- **开始之前** —— 系统、终端、包管理器、有没有用到 git、工作区路径。日志里没有的信息就留空，不补。

### 右边的草稿

右边是一份普通的 Markdown 技能文件，保存前可以逐行检查：

- **技能名** —— 就是文件夹名。航图会自动挑一个没被占用的名字，所以保存第二份草稿时，不会悄悄盖掉第一份。
- **包含哪些内容** —— 步骤、验证、文件、踩坑、开始之前、目标，都可以单独关掉；改动后草稿会重新生成。
- **编辑器** —— 可以直接改。开始手改之后，草稿就不再自动刷新；想重新生成，按 **重新生成**，它会先提醒会覆盖手改内容。文件开头的 `name` 始终跟着文件夹名走。
- **复制 Markdown** —— 把内容放进剪贴板。
- **下载 SKILL.md** —— 存到下载文件夹。
- **保存到技能库** —— 写进本机技能库。弹窗会先显示具体写到哪里；如果已经有同名技能，必须勾选 **覆盖** 才能保存，而且旧文件会先备份。

保存完，页面会告诉你文件写到了哪里、备份在哪里、写入时又脱敏了几处。

## 技能存到哪

```text
~/.dsh/skills/<名字>/SKILL.md          # 默认位置
$DSH_HOME/skills/<名字>/SKILL.md       # 设置了 DSH_HOME 时
```

这就是 DSH 本来就会扫描的用户技能目录。写进去的技能会被自动发现，之后开新会话就能用。航图不会写到别的目录，也不会写出半截文件：内容先写进临时文件，再整体改名到位。

## 隐私：不会把你的密钥漏出去

会话里经常带着密钥、令牌和邮箱。所有清理都在**你的电脑上、内容进入页面之前**完成：

- 私钥块、JWT、GitHub / AWS / Google / Slack / npm / PyPI / Stripe / DeepSeek 形状的密钥、`Bearer` 头、网址里的账号密码、`api_key = …` 这类赋值、邮箱地址，都会被替换成 `«已脱敏»`。
- 页面会告诉你一共遮住了多少处、涉及哪几类，但不会显示被遮住的内容。
- 保存时还会**再脱敏一遍**，所以就算手动改过，也不会把密钥又带回去。
- 只是“长得像密钥”的东西不动：`process.env.X`、`${模板变量}`、`foo.bar.baz`、`ALL_CAPS_CONSTANTS`，以及很短的字符串。
- 自动脱敏默认开着。如果你关掉它，页面和保存弹窗都会如实说明，而不是假装还开着。

内容不会上传。插件通过 Harness 自带的 `sessionQuery` 读取当前会话，只往技能目录里写文件。

## 安装

需要 Node.js 22.19+（或 24+）和 DeepSeek Harness 0.1.0-rc.6+。

```sh
git clone https://github.com/xh0915/dsh-chart
cd dsh-chart
pnpm install
pnpm run build
dsh plugin --profile web add .
```

重启 Web Harness。打开一个聊过天的会话，顶部就会出现 **航图** 标签。

**`add` 之前必须先跑 `pnpm run build`。** 这个包没有安装时自动构建的脚本（pnpm 10 默认拦截未批准的 `prepare` 脚本）；跳过这一步，插件会装上但加载不起来。

卸载：

```sh
dsh plugin --profile web remove dsh-chart
```

## 设置

```yaml
dsh-chart:
  redactSecrets: true   # 内容进入页面前遮住密钥（默认）
  maxSteps: 30          # 最多保留多少条可用步骤，5–200
```

会话里成功命令太多、超出上限时，草稿按顺序保留前 `maxSteps` 条，并附一句“有内容被省略”，不会悄悄丢掉。验证、踩坑、改动文件也各有固定上限（12、12、24 条），到顶时同样会标注。

## 边界

- **只写真实发生过的事。** 有一步，是因为某条命令执行成功了；有一个坑，是因为某条命令失败了；有一个文件，是因为某次编辑或写入生效了。不从描述里推断。
- **没有报错原文的失败，不写成坑。** 这种失败仍然计入失败次数，但不会编一句话塞进技能里。
- **没通过的验证不叫验证。** 失败过的测试、lint 不会出现在验证一节。
- **不编造技能发现规则。** 技能写到 DSH 真正会扫描的用户技能目录；预设自带的文件夹不碰。
- **插件本身不联网。** 不调用模型、不执行命令、不做统计上报；它只是把你自己会话里的数据摆出来。
- **不给费用数字。** 日志里没有价格，插件就不猜。
- 界面跟随 Harness 的浅色和深色主题，支持中文和英文。

## 技术细节

<details>
<summary>给要改代码的人</summary>

### 目录

```text
package.json           # dsh.bundle.patch + dsh.client、脚本、peer 依赖
cordis.patch.yml       # 把宿主插件挂进 profile
dsh.plugin.json        # 插件清单
src/index.ts           # 宿主入口：Config、ChartRuntime、Typert 清单
src/runtime.ts         # chart.build / chart.library / chart.save
src/distill.ts         # 会话日志 -> 目标、步骤、验证、文件、坑、环境
src/library.ts         # 本机技能库：解析、列出、保存、备份
src/redact.ts          # 本机密钥脱敏
src/schema.ts          # Zod 定义的线上格式（类型由它推出，不会漂移）
src/contract.ts        # 宿主和前端共用的严格 InvocationDescriptor
src/typert.ts          # 宿主反射清单
src/client/index.tsx   # 前端入口：挂载 Remote、注册标签
src/client/view.tsx    # 航图界面
src/client/skill.ts    # SKILL.md 生成 + 开头字段同步
src/client/styles.ts   # 跟随 Harness 明暗主题的样式
src/client/locales.ts  # 中英文文案
tests/                 # 蒸馏、技能库、Markdown、契约、前端入口测试
build.mjs              # esbuild 双构建：宿主 ESM + 给网页加载器用的前端包
```

前端这一半**不提供**任何提示词、工具或会话事件 —— `ctx.typert.register()` 只发布反射元数据。插件展示的是你自己的数据。

### 开发

```sh
pnpm run check   # 类型检查 + lint + 测试 + 构建
```

### 改名

如果要 fork 后改名，下面这些地方要一起改：`package.json` → `name`、`exports`、`files`；`build.mjs` → `__ModuleLoader__.load` 的 id；`src/index.ts` → `name`；`src/client/remote.ts` → 十六进制编码的 `TypertRemoteNamespace$…` 名字；`src/client/locales.ts` → 语言命名空间；`src/client/index.tsx` → 槽位 id；`src/typert.ts` → `package`；`src/contract.ts` → 调用 id；`cordis.patch.yml` → `id` 和 `name`；`dsh.plugin.json` → `id`。

</details>

## 许可证

MIT

作者：[里卡多 / xh0915](https://xh0915.github.io)
