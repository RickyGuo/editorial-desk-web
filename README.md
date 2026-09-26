# 编辑部协作台（独立网站版）

Cloudflare Pages + Functions + D1，静态前端 `index.html`，接口在 `functions/api/*`。

## 一次性搭建步骤

1. **建 D1 数据库**：Cloudflare 后台 -> Workers & Pages -> D1 -> Create database，随便起个名字（比如 `editorial-desk-db`）。
2. **建好表**：进这个数据库的 Console 标签页，把 `schema.sql` 的全部内容粘进去执行一次。
3. **建 Pages 项目**：Workers & Pages -> Create -> Pages -> Connect to Git，选这个仓库，Build 设置全部留空（没有构建步骤，Framework preset 选 "None"，Build output directory 填 `/`）。
4. **绑定数据库**：Pages 项目建好后 -> Settings -> Functions -> D1 database bindings -> Add binding，Variable name 填 `DB`，选第 1 步建的数据库。
5. 保存后 Cloudflare 会自动重新部署一次，之后打开 Pages 给的 `*.pages.dev` 网址就能用了。

## 以后怎么改

以后要改内容展示逻辑或加新功能，直接把新代码 push 到这个仓库的默认分支，Cloudflare 会自动重新构建部署，不需要重复上面 1-4 步（除非要新加数据表，那还是要去 D1 Console 跑一下新的建表语句）。

## 现在这版做了什么

- 账户注册 / 登录（用户名 + 邮箱 + 密码，密码服务器端加盐 PBKDF2 哈希存储）
- 多主题（"俱乐部"），主题内昵称
- 留言板，主题创建者可以删除任何人的留言（举报后的应急处理）

## 还没做（下一步）

- 任务接力清单
- 投票
- 活跃度排行
- 绑定你自己的域名（1728.one）到这个 Pages 项目
