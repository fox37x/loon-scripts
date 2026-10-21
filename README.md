# loon-scripts

## 网易大神每日领券 (ds163)

Loon 插件地址：

```
https://raw.githubusercontent.com/fox37x/loon-scripts/main/ds163.plugin
```

1. Loon → 配置 → 插件 → + → 粘贴上面的地址
2. 开着 Loon，用 Safari 打开一次（替换成你自己的值）：
   `https://inf.ds.163.com/v1/web/ds163-config?token=你的BotToken&chat=你的ChatID`
3. 开着 Loon 打开「网易大神」小程序的权益页，自动抓 Cookie
4. 每天 23:59 启动，北京时间 00:00:00 和 00:01:00 各抢一轮，结果推送到 Telegram

仓库不含任何 Cookie / Token，它们只保存在手机 Loon 本地。

**手动运行一次（测试用）**：开着 Loon，用 Safari 打开
`https://inf.ds.163.com/v1/web/ds163-run`
结果会显示在页面上并推送到 TG。白天运行每张券只领一次，0 点前运行会等到开抢时间。
