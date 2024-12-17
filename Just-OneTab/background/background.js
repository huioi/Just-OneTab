// 插件图标点击事件：收纳全部标签页
chrome.action.onClicked.addListener(async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // 过滤掉插件页面和系统页面
    const validTabs = getValidTabs(tabs).filter(tab => {
        // 避免关闭插件管理页面
        const managePageUrl = chrome.runtime.getURL("pages/index.html");
        return tab.url !== managePageUrl;
    });

    if (validTabs.length > 0) {
        // 收纳有效标签并保存到存储
        const newGroup = createGroup(validTabs);
        const allGroups = await saveNewGroup(newGroup);

        await closeTabs(validTabs); // 收纳完成后关闭已收纳标签
        await new Promise(resolve => setTimeout(resolve, 100)); // 加入短暂延迟，确保标签关闭完成后再执行后续逻辑
        await notifyManagePage(allGroups); // 通知管理页面更新
        await ensurePinnedManagePage(); // 确保管理界面打开
    } else {
        const groups = await loadGroups();
        if (groups.length > 0) await ensurePinnedManagePage(); // 没有有效标签时只检查管理页面
    }
});

// 获取有效标签页
function getValidTabs(tabs) {
    return tabs.filter(
        (tab) =>
            !tab.url.startsWith("chrome://") &&
            !tab.url.startsWith("chrome-extension://") &&
            !tab.url.startsWith("edge://") &&
            !tab.url.startsWith("edge-extension://")
    );
}

// 创建新分组
function createGroup(tabs) {
    return {
        id: Date.now().toString(),
        createTime: new Date().toLocaleString(),
        tabs: tabs.map((tab) => ({
            title: tab.title || "未命名标签页",
            url: tab.url,
            favIconUrl: tab.favIconUrl || "",
        })),
    };
}

// 保存新分组到存储
async function saveNewGroup(newGroup) {
    const groups = await loadGroups();
    groups.unshift(newGroup); // 将新组添加到列表顶部
    await chrome.storage.local.set({ savedTabsGroups: groups });
    return groups; // 返回所有分组
}

// 加载所有分组
async function loadGroups() {
    const data = await chrome.storage.local.get("savedTabsGroups");
    return data.savedTabsGroups || [];
}

// 通知管理页面更新数据
async function notifyManagePage(groups) {
    const managePageUrl = chrome.runtime.getURL("pages/index.html");
    const tabs = await chrome.tabs.query({ url: managePageUrl });

    if (tabs.length > 0) {
        const manageTabId = tabs[0].id;
        // 使用 sendMessage 通知管理页面更新数据
        chrome.tabs.sendMessage(manageTabId, { action: "update", groups }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("无法通知管理页面更新：" + chrome.runtime.lastError.message);
            }
        });
    }
}

// 关闭指定标签页
async function closeTabs(tabs) {
    await Promise.all(tabs.map((tab) => chrome.tabs.remove(tab.id)));
}

// 确保管理页面展示为固定标签
async function ensurePinnedManagePage() {
    const managePageUrl = chrome.runtime.getURL("pages/index.html");
    const existingManagePages = await chrome.tabs.query({ url: managePageUrl });

    if (existingManagePages.length > 0) {
        const manageTab = existingManagePages[0];
        if (!manageTab.pinned) await chrome.tabs.update(manageTab.id, { pinned: true }); // 确保页面固定
        await chrome.tabs.update(manageTab.id, { active: true }); // 激活页面
    } else {
        chrome.tabs.create({ url: managePageUrl, pinned: true });
    }
}

// 初始化右键菜单
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "save-current-tab",
            title: "仅收纳此标签页",
            contexts: ["all"],
        });

        chrome.contextMenus.create({
            id: "save-all-tabs",
            title: "收纳全部标签页",
            contexts: ["all"],
        });

        chrome.contextMenus.create({
            id: "separator",
            type: "separator",
            contexts: ["all"],
        });

        chrome.contextMenus.create({
            id: "open-just-onetab",
            title: "整理 Just-OneTab",
            contexts: ["all"],
        });
    });
});

// 菜单点击事件监听
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "open-just-onetab") {
        await ensurePinnedManagePage(); // 打开管理页面
    } else if (info.menuItemId === "save-current-tab" && tab) {
        // 收纳单个标签页
        const tabInfo = {
            title: tab.title || "未命名标签页",
            url: tab.url,
            favIconUrl: tab.favIconUrl || "",
        };
        const newGroup = createGroup([tabInfo]);
        const allGroups = await saveNewGroup(newGroup);

        await closeTabs([tab]); // 关闭已收纳标签
        await notifyManagePage(allGroups); // 通知管理页面更新
    } else if (info.menuItemId === "save-all-tabs") {
        // 收纳当前窗口的所有标签页
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const validTabs = getValidTabs(tabs);

        if (validTabs.length > 0) {
            const newGroup = createGroup(validTabs);
            const allGroups = await saveNewGroup(newGroup);

            await closeTabs(validTabs); // 关闭已收纳标签
            await notifyManagePage(allGroups); // 通知管理页面更新
        }
    }
});
