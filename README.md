# Pure LinkedIn

Following, not recommended.

适用于 LinkedIn 桌面网页版的 Tampermonkey／Violentmonkey 脚本：默认使用 Recent 排序、关注优先，清理推荐与显式广告，保留主动搜索、职业功能和日常互动。

## 功能

- 首页默认选择 **Recent（最新）**，过滤明确未关注作者、推荐及联系人点赞／评论带来的动态；保留原创、主动转发和无法确认来源的帖子。
- 清理明确标记的 Promoted／Sponsored 广告、广告侧栏、推荐关注、已识别的热点与相关推荐。
- 隐藏 Premium 推广、For Business 导航、小游戏模块和首页招聘营销提示；已输入内容的招聘表单保留。
- 人脉页移除推荐模块，保留邀请、联系人和关注管理；职位页移除已识别的推荐职位，保留搜索、偏好、职位跟踪和申请功能。
- 保留消息、通知、收藏、个人／公司主页、群组、活动、发帖、评论及视频播放功能。
- 过滤后当前已加载的帖子全部不可见时，显示说明与设置入口。

支持 `https://www.linkedin.com/*` 桌面网页版；不承诺手机网页版、App 或其他子域名兼容。

## 安装

需要浏览器安装 Tampermonkey 或 Violentmonkey 扩展。

### 一键安装

[安装 Pure LinkedIn (Github)](https://raw.githubusercontent.com/squarezhong/pure-linkedin/main/pure-linkedin.user.js)

### 手动安装

在扩展中新建脚本，将 [pure-linkedin.user.js](pure-linkedin.user.js) 的全部内容复制进去，替换默认模板并保存；也可通过扩展的本地文件导入功能安装。手动安装后更新需替换脚本。

安装完成后刷新 LinkedIn 页面。

## 设置

通过油猴菜单打开 **Pure LinkedIn：设置**。可分别调整 Recent、严格过滤、显式广告、内容推荐、人脉推荐、职位推荐、Premium、For Business 和小游戏。默认全部启用净化，页面没有常驻设置按钮。

点击“保存”后生效；取消、Esc 或点击弹窗外部均不保存。“恢复默认”也需要保存。支持的管理器会将设置同步到其他 LinkedIn 标签页；已打开的设置草稿不会被远程更新覆盖。

清理未及时生效时，可使用 **Pure LinkedIn：重新应用规则**。关闭规则会恢复脚本隐藏的内容；关闭 Recent 不会主动切回 Top。
