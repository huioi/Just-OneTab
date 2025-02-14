<div align="center">
    <img src="./Just-OneTab/images/icon.png" alt="Just-OneTab Icon" width="20%" height="20%" />
    <h1>Just-OneTab</h1>
    <p>一款为浏览器<b>标签页收纳与整理</b>设计的插件，可有效<b>节省内存</b>并<b>缓解标签页杂乱</b>问题</p>
    <p>（功能精简，界面清爽，交互友好，兼容 Chrome、Edge 等基于 Chromium 内核的浏览器）</p>
    <br />
    <br />
</div>

## 💡功能简介
- **固定管理界面**：将管理界面缩小并固定在浏览器窗口的最左侧，方便随时访问。
- **收纳所有标签页**：通过点击插件图标或右键菜单，将当前窗口中的所有标签页一键保存。
- **收纳单个标签页**：通过右键菜单，支持单独收纳某个标签页，灵活管理。
- **分组管理**：收纳的标签页会根据收纳时间自动分组。支持对单个分组一键进行“打开、删除或分享”，也可以针对所有分组执行“全部打开、删除或分享”的操作。
- **标签搜索**：通过搜索框快速查找和筛选所需的标签页，高效定位内容。
- **Markdown 分享**：将单个分组或所有分组分享为 Markdown 格式，便于分享或备份。
- **右键菜单快捷操作**：
    - 仅收纳此标签页
    - 收纳全部标签页
    - 整理 Just-OneTab （进入管理界面）
## 🖼️截图预览
![image](https://github.com/user-attachments/assets/e313e69c-d6ac-415e-b12e-2c8216d2aef6)
![image](https://github.com/user-attachments/assets/d1b7d920-b384-428d-a49d-61d86faacc30)
## 📦安装步骤
### 🟢🔴🟡🔵Google Chrome 浏览器
由于 Google Chrome 禁用非 Chrome 应用商店插件，**快速安装**后重启 Chrome 会将插件自动清除卸载。因此，请选择**完整安装**的方式将 Just-OneTab 添至白名单后方可长期正常使用。
#### 快速安装（不推荐，仅适用于开发与测试环境）
进入插件管理页面，点击加载已解压的扩展程序，选择 Just-OneTab 文件夹（安装后文件夹不可删除）。
#### 完整安装（强烈推荐）
1. 下载项目 [Release](https://github.com/huioi/Just-OneTab/releases) 中`Just-OneTab.crx`文件。
2. 进入浏览器扩展程序管理（地址栏输入`chrome://extensions`），启用开发者模式，将 Just-OneTab.crx 文件拖入浏览器窗口进行安装，接着复制 Chrome 给 Just-OneTab 分配的扩展程序 ID。
3. 下载项目中`chrome.adm`文件（或于 [The Chromium Projects](https://www.chromium.org/administrators/policy-templates) 自行下载“policy_templates.zip”并解压打开目录“windows > adm > zh-CN > chrome.adm”）。
4. `Win + R`进入运行，输入`gpedit.msc`进入本地组策略编辑器，右键接连点击“计算机配置 > 管理模版”，点击“添加/删除模板”，选择添加 chrome.adm 后确定。
5. 接着返回本地策略组编辑器，点击“计算机配置 > 管理模版 > 经典管理模板 > Google > Google Chrome > 扩展程序”，双击或右键编辑设置“配置扩展程序安装许可名单”，点击`已启用`，点击“选项（显示）”，在“显示内容”中粘贴第 2 步复制的插件 ID 后确定。

<img src="https://github.com/user-attachments/assets/96e40d8d-8539-42ce-b79e-3dafb3b06d22" width="287px">
<img src="https://github.com/user-attachments/assets/7512efae-4bf4-491e-b23d-eed69ee34131" width="513px">

### 🌀Microsoft Edge 浏览器
点击 https://microsoftedge.microsoft.com/addons/detail/gjnhfggmogappochmnaiphnnmjfhofic 一键安装，或进入 Edge 扩展中心自行搜索。
## ▶️使用说明
### 快速开始
1. 安装插件后，右键点击浏览器右上角的插件图标。
2. 在弹出的菜单中，点击`整理 Just-OneTab`以激活插件。
### 具体操作
- **标签操作**
    - 点击标签页直接打开并从分组中移除。
    - 光标悬浮在标签页上，点击 `×` 按钮删除单个标签。
- **分组操作**
    - `打开组`：打开该分组内的所有标签页。
    - `删除组`：移除该标签页分组。
    - `分享组`：分组以 Markdown 进行分享。
- **顶部操作**
    - `全部打开`：打开所有收纳的标签页。
    - `全部删除`：清空所有分组。
    - `全部分享`：所有分组以 Markdown 进行分享。
    - `搜索框🔍`：查找、筛选标签页。
## 💭其他
### 项目起源
在长期使用 [OneTab](https://www.one-tab.com) 的过程中，遇到一些令我困扰的问题，其中最显著的是右键菜单中冗长的选项列表。实际使用中，我仅需“仅发送此标签页到 OneTab”这一功能，但每次都需要在众多选项中寻找，虽然单次耗时不长，却在长期使用中积累了大量时间成本，大大降低了使用效率。

为此，我打算边做边学，从零开发，打造一款功能更精简、界面更清爽、交互更友好的标签页收纳工具。在项目推进过程中，交替使用大语言模型（包括 ChatGPT 4o、Claude 3.5 Sonnet、o1 preview 和 Gemini 1.5 Flash）完成了核心代码的开发，同时对功能、界面和交互进行了全面设计、优化和测试。
### 其他特性
- 不联网，所有数据保存在本地。
- 未设计标签页分类功能，一方面由于个人对此没有需求，另一方面认为浏览器默认书签/收藏夹或各类书签整理插件足以满足此任务。
### 疑存问题
1. 在标签页未完全加载时点击收纳，Just-OneTab 可能无法将其进行收纳或将其收纳为“未命名标签页”，再次打开此标签页会反馈不存在。

2. 收纳正在编辑状态，关闭会弹窗选项对话框“是否离开此网站”的标签页，且选择“取消”后，再此进入 Just-OneTab 管理页面可能不会显示刚收纳的标签页，此时需要刷新才会正确显示。同时，在此情况下，插件有一定运行崩溃的概率。（后续尝试解决方法：调整界面渲染函数的逻辑结构）

3. 如果标签页组较多，会进行多次界面渲染，由此可能导致页面卡顿。（后续尝试解决方法：通过批量操作降低 DOM 重绘次数）
### 关于仓库
本仓库主要用于个人存档，若其他人看到后有兴趣使用，请随意。
