# MDN Search 中文

在 Visual Studio Code 中快速搜索 CSS、JavaScript、Web API、HTML、HTTP、SVG 等 MDN 文档。

## 功能

- 默认用中文 MDN Hover 替代内置英文 CSS 文档 Hover。
- 选中关键词或将光标放在标识符上，按 `Ctrl+Shift+F1` 查询。
- 可以通过编辑器右键菜单执行查询。
- 在独立侧边栏中展示中文定义和 MDN 全站候选结果。
- 点击搜索结果后在侧边栏内查看详细章节、代码示例、参数和规范信息。
- CSS 属性额外展示语法、属性信息和兼容性摘要。
- 中文内容缺失时回退英文。
- 网络不可用时仍展示随扩展打包的本地 CSS 元数据。

## 使用

1. 在任意代码文件中选中 `Array.prototype.map`、`fetch`、`display` 等关键词。
2. 按 `Ctrl+Shift+F1`，或右键选择“MDN Search: 搜索选中内容”。
3. 在侧边栏查看中文 MDN 定义及相关结果，点击“查看详情”继续阅读章节和示例。
4. 在 CSS、SCSS 和 Less 中将鼠标悬停在 CSS 属性上，可以直接查看中文定义；点击“查看详细章节”可展开更多内容。

macOS 默认快捷键为 `Cmd+Shift+F1`。也可以从命令面板运行“MDN Search: 搜索选中内容”。

## 数据与隐私

扩展只在用户主动搜索，或悬停标准 CSS 属性时，向 `developer.mozilla.org` 请求查询关键词对应的公开文档摘要。不会上传完整代码、文件内容、文件路径或工作区信息。

本扩展使用 `mdn-data` 和 `@mdn/browser-compat-data` 生成本地 CSS 属性索引。MDN 文档内容来自 MDN Web Docs，并按 CC-BY-SA 许可署名。
