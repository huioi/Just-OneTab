// background.js

/**
 * 获取扩展管理页面的 URL。
 * @returns {string} 管理页面的 URL。
 */
function getManagePageUrl() {
    return chrome.runtime.getURL("pages/index.html");
}

/**
 * 确保管理页面已打开、已固定，并可选择是否激活。
 * @param {boolean} activate - 如果页面存在或被创建，是否激活该标签页。
 * @param {boolean} isCreatingTab - 一个提示，表明此调用是否属于标签页创建流程的一部分。
 */
async function ensurePinnedManagePage(activate = true, isCreatingTab = false) {
    const managePageUrl = getManagePageUrl();
    try {
        let tabs = await chrome.tabs.query({ url: managePageUrl });
        let manageTab;

        if (tabs.length > 0) {
            manageTab = tabs[0];
            if (activate) {
                // 如果标签页未固定，并且当前不是正在创建它（因为创建逻辑可能会固定它），则固定它。
                if (!manageTab.pinned && !isCreatingTab) {
                    try { await chrome.tabs.update(manageTab.id, { pinned: true }); }
                    catch (e) { console.warn(`固定现有管理标签页失败 (ID: ${manageTab.id}):`, e.message); }
                }
                // 激活标签页
                try { await chrome.tabs.update(manageTab.id, { active: true }); }
                catch (e) { console.warn(`激活管理标签页失败 (ID: ${manageTab.id}):`, e.message); }

                // 聚焦包含该标签页的窗口
                if (manageTab.windowId && manageTab.windowId !== chrome.windows.WINDOW_ID_NONE) {
                    try { await chrome.windows.update(manageTab.windowId, { focused: true }); }
                    catch (e) { console.warn(`聚焦窗口失败 (ID: ${manageTab.windowId}):`, e.message); }
                }
            } else if (!manageTab.pinned && !isCreatingTab) { // 如果不激活，但它存在且未固定
                try { await chrome.tabs.update(manageTab.id, { pinned: true }); }
                catch (e) { console.warn(`固定现有非活动管理标签页失败 (ID: ${manageTab.id}):`, e.message); }
            }
        } else if (activate || isCreatingTab) { // 标签页不存在，则创建它
            try {
                // 首先尝试在现有的普通窗口中创建
                const currentWindows = await chrome.windows.getAll({ populate: false, windowTypes: ["normal"] });
                if (currentWindows.length > 0) {
                     manageTab = await chrome.tabs.create({ url: managePageUrl, pinned: true, active: activate, windowId: currentWindows[0].id });
                } else { // 没有普通窗口存在，则创建一个新窗口
                    const newWindow = await chrome.windows.create({ url: managePageUrl, focused: activate, type: "normal" });
                    if (newWindow.tabs && newWindow.tabs.length > 0) {
                        manageTab = newWindow.tabs[0];
                        // 如果创建调用未处理固定（例如，如果 `windows.create` 不支持 `pinned:true`），则确保其已固定
                        if (!manageTab.pinned) {
                             try { await chrome.tabs.update(manageTab.id, { pinned: true }); }
                             catch (e) { console.warn(`在新窗口中固定新创建的管理标签页失败 (ID: ${manageTab.id}):`, e.message); }
                        }
                    }
                }
            } catch (e) {
                console.error("创建或固定管理标签页失败:", e.message);
            }
        }
    } catch (error) {
        console.error("ensurePinnedManagePage 函数出错:", error.message);
    }
}


/**
 * 过滤标签页数组，获取有效的、可保存的标签页。
 * 排除 chrome://, chrome-extension://, edge:// 协议的 URL 以及管理页面本身。
 * @param {chrome.tabs.Tab[]} tabs - 需要过滤的标签页数组。
 * @returns {chrome.tabs.Tab[]} 过滤后的有效标签页数组。
 */
function getValidTabs(tabs) {
    const managePageUrl = getManagePageUrl();
    const invalidPrefixes = ["chrome://", "chrome-extension://", "edge://"]; // 不应处理的URL前缀
    return tabs.filter(tab =>
        tab.url && tab.id && // 确保标签页有URL和ID
        !invalidPrefixes.some(prefix => tab.url.startsWith(prefix)) && // 排除无效前缀的URL
        tab.url !== managePageUrl // 排除管理页面自身
    );
}

/**
 * 创建一个新的标签页组对象。
 * @param {chrome.tabs.Tab[]} tabsToSave - 需要包含在组内的标签页数组。
 * @returns {object} 新的标签页组对象。
 */
function createGroup(tabsToSave) {
    const createTime = new Date().toLocaleString(); // 使用本地化时间字符串
    return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 生成唯一ID
        createTime: createTime,
        customName: createTime, // 默认组名，用户可以修改
        tabs: tabsToSave.map(tab => ({
            title: tab.title || "未命名标签页",
            url: tab.url,
            favIconUrl: tab.favIconUrl || "", // 标签页图标URL
        })),
    };
}

/**
 * 从本地存储中加载已保存的标签页组。
 * @returns {Promise<object[]>} 一个解析为标签页组对象数组的 Promise。
 */
async function loadGroups() {
    try {
        const data = await chrome.storage.local.get("savedTabsGroups");
        return data.savedTabsGroups || []; // 如果未找到，则返回空数组
    } catch (error) {
        console.error("从存储加载标签页组失败:", error.message);
        return []; // 出错时返回空数组
    }
}

/**
 * 将新标签页组保存到本地存储，并添加到现有组的前面。
 * @param {object} newGroup - 需要保存的新标签页组对象。
 * @returns {Promise<object[]>} 一个解析为更新后的所有标签页组数组的 Promise。
 */
async function saveNewGroup(newGroup) {
    try {
        const groups = await loadGroups();
        groups.unshift(newGroup); // 将新组添加到数组开头
        await chrome.storage.local.set({ savedTabsGroups: groups });
        return groups;
    } catch (error) {
        console.error("保存新标签页组失败:", error.message);
        return loadGroups(); // 出错时返回当前（可能未成功保存新组的）组列表
    }
}

/**
 * 关闭一个标签页数组中的所有标签页。
 * @param {chrome.tabs.Tab[]} tabsToClose - 需要关闭的标签页数组。
 */
async function closeTabs(tabsToClose) {
    if (!tabsToClose || tabsToClose.length === 0) return;
    const tabIdsToClose = tabsToClose.map(tab => tab.id).filter(id => id != null); // 获取有效的标签页ID
    if (tabIdsToClose.length === 0) return;

    try {
        await chrome.tabs.remove(tabIdsToClose);
    } catch (error) {
        // 如果某些标签页无法关闭（例如，受保护的标签页或已关闭），则记录错误
        console.warn("关闭部分标签页时出错:", error.message, "标签页 ID:", tabIdsToClose);
    }
}

/**
 * 通知管理页面（如果已打开）有关标签页组的更新。
 * @param {object[]} groups - 更新后的标签页组对象数组。
 */
async function notifyManagePage(groups) {
    const managePageUrl = getManagePageUrl();
    try {
        const tabs = await chrome.tabs.query({ url: managePageUrl });
        if (tabs.length > 0 && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "update", groups }, response => {
                if (chrome.runtime.lastError) {
                    // 管理页面可能未就绪或已关闭，这通常是正常情况，作为警告处理。
                    // console.warn("通知管理页面失败 (可能已关闭或未就绪):", chrome.runtime.lastError.message);
                }
            });
        }
    } catch (error) {
        console.error("尝试通知管理页面时出错:", error.message);
    }
}

/**
 * 将指定的标签页保存到一个新组中，可选择关闭它们，并刷新管理页面。
 * @param {chrome.tabs.Tab[]} tabsToSave - 需要保存的标签页数组。
 * @param {chrome.tabs.Tab[]} [tabsToCloseAfterSave=null] - 保存后需要关闭的标签页数组。
 * @param {boolean} [activateManagerPage=true] - 是否打开并激活管理页面。
 */
async function saveAndRefresh(tabsToSave, tabsToCloseAfterSave = null, activateManagerPage = true) {
    if (activateManagerPage) {
        // 确保管理页面已打开（但如果正在创建它，则先不激活）
        await ensurePinnedManagePage(false, true);
    }

    if (!tabsToSave || tabsToSave.length === 0) { // 如果没有标签页可保存
        if (activateManagerPage) { // 但被要求打开管理页面（例如，“全部保存”但没有有效标签页）
            await ensurePinnedManagePage(true); // 激活管理页面
        }
        return; // 无需保存，直接返回
    }

    const newGroup = createGroup(tabsToSave);
    const allGroups = await saveNewGroup(newGroup);

    if (tabsToCloseAfterSave && tabsToCloseAfterSave.length > 0) {
        await closeTabs(tabsToCloseAfterSave);
    }

    // 短暂延迟，在通知之前让UI更新或存储操作稳定下来。
    // 埋点：如果出现问题，这可能是一个需要调查更稳健的事件驱动逻辑的点。
    await new Promise(resolve => setTimeout(resolve, 150));

    await notifyManagePage(allGroups);

    if (activateManagerPage) {
        await ensurePinnedManagePage(true); // 现在激活管理页面
    }
}

// 浏览器操作（扩展图标点击）的监听器
chrome.action.onClicked.addListener(async (clickedTabObject) => {
    // 从同步存储中获取图标点击行为设置，默认为 'saveAllInWindow'
    const { iconAction } = await chrome.storage.sync.get({ iconAction: 'saveAllInWindow' });

    let tabsToProcess = [];
    let tabsToClose = [];
    // 根据操作类型确定是否应激活管理页面
    const activateManagerPage = (iconAction === 'saveAllInWindow');

    if (iconAction === 'saveCurrentTab') { // 如果设置为仅保存当前标签页
        // 获取当前活动标签页，优先使用点击事件传递的标签页对象
        const tabToSave = clickedTabObject && clickedTabObject.id ? clickedTabObject : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        if (tabToSave) {
            tabsToProcess = getValidTabs([tabToSave]); // 过滤获取有效标签页
            tabsToClose = tabsToProcess; // 关闭被保存的标签页
        }
    } else { // 默认为 'saveAllInWindow' (保存窗口中所有标签页)
        // 获取当前窗口ID，优先使用点击事件传递的标签页对象中的windowId
        const windowIdToQuery = clickedTabObject ? clickedTabObject.windowId : chrome.windows.WINDOW_ID_CURRENT;
        const allTabsInWindow = await chrome.tabs.query({ windowId: windowIdToQuery });
        tabsToProcess = getValidTabs(allTabsInWindow); // 过滤获取有效标签页
        tabsToClose = tabsToProcess; // 关闭所有被处理的标签页
    }

    if (tabsToProcess.length > 0) { // 如果有有效的标签页需要处理
        await saveAndRefresh(tabsToProcess, tabsToClose, activateManagerPage);
    } else if (activateManagerPage) { // 如果是“全部保存”操作但未找到有效标签页
        // 仍然打开/激活管理页面
        await ensurePinnedManagePage(true);
    }
    // 如果是保存单个标签页 (!activateManagerPage) 且未找到有效标签页，则不执行任何操作。
});

// 定义上下文菜单项的固定结构和顺序
const fixedContextMenuItems = [
    { id: "save-current-tab", title: "仅收纳此标签页", contexts: ["page", "frame", "action"] },
    { id: "save-all-tabs", title: "收纳全部标签页", contexts: ["action", "page", "frame"] },
    { type: "separator", id: "sep1", contexts: ["action", "page", "frame"] }, // 分隔线
    { id: "open-just-onetab", title: "整理 Just-OneTab", contexts: ["action", "page", "frame"] },
    { id: "open-options-page", title: "设置", contexts: ["action"] }
];

/**
 * 根据固定定义创建或重新创建扩展的上下文菜单。
 */
async function createFixedContextMenus() {
    for (const itemProps of fixedContextMenuItems) {
        try {
            // 使用展开运算符传递所有相关属性，如 type, title, contexts, id
            chrome.contextMenus.create({ ...itemProps });
        } catch (e) {
            console.error(`创建上下文菜单项 "${itemProps.id || itemProps.title}" 失败:`, e.message);
        }
    }
    // console.log("固定的上下文菜单已创建/更新。");
}

// 扩展安装或更新时的监听器
chrome.runtime.onInstalled.addListener((details) => {
    // 初始默认设置
    const initialDefaultSettings = {
        themePreference: 'system',
        hoverToShowSettingsIcon: true,
        enableDragAndDrop: true,
        iconAction: 'saveAllInWindow',
        searchGroupTitles: true,
        searchTabURLs: true,
        showHeaderSearch: true,
        showHeaderOpenAll: true,
        showHeaderDeleteAll: true,
        showHeaderExport: true,
        showHeaderImport: true,
        showGroupOpenButton: true,
        showGroupDeleteButton: true,
        showGroupExportButton: true,
    };

    // 获取所有当前存储的设置，使用 initialDefaultSettings 作为缺失键的默认值
    chrome.storage.sync.get(initialDefaultSettings, (storedSettings) => {
        // storedSettings 现在包含一个合并视图：存储的值优先，否则使用 initialDefaultSettings 中的默认值。
        const settingsToSave = { ...initialDefaultSettings, ...storedSettings };

        // 保存可能已更新的设置（包含新的默认值，移除过时的设置）
        chrome.storage.sync.set(settingsToSave, () => {
            if (chrome.runtime.lastError) {
                console.error("保存初始/更新的设置失败:", chrome.runtime.lastError.message);
            }
            createFixedContextMenus(); // 每次安装/更新时都重新创建菜单
        });
    });

    // 可选：首次安装时打开管理页面或“欢迎”页面
    if (details.reason === "install") {
        // ensurePinnedManagePage(true, true); // 示例：首次安装时打开管理页面
    }
});

// 上下文菜单点击事件的监听器
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    switch (info.menuItemId) {
        case "open-just-onetab": // 打开 "整理 Just-OneTab" 页面
            await ensurePinnedManagePage(true);
            break;
        case "open-options-page": // 打开扩展的设置页面
            chrome.runtime.openOptionsPage();
            break;
        case "save-current-tab": // 仅收纳此标签页
            if (tab && tab.id) { // 确保有有效的标签页上下文
                const tabsToProcess = getValidTabs([tab]);
                if (tabsToProcess.length > 0) {
                    // 保存当前标签页，关闭它，并且不激活管理页面。
                    await saveAndRefresh(tabsToProcess, tabsToProcess, false);
                }
            } else {
                console.warn("“仅收纳此标签页”在没有有效标签页上下文的情况下被调用。");
            }
            break;
        case "save-all-tabs": // 收纳全部标签页
            // 获取当前窗口ID
            const windowIdToQueryCtx = tab ? tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
            const allTabsInWindow = await chrome.tabs.query({ windowId: windowIdToQueryCtx });
            const tabsToProcessFromCtx = getValidTabs(allTabsInWindow);
            // 保存所有标签页，关闭它们，并激活管理页面。
            await saveAndRefresh(tabsToProcessFromCtx, tabsToProcessFromCtx, true);
            break;
    }
});