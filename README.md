# 国家统计局MCP/Agent数据获取工具

## 项目概述
本项目是一个基于MCP（Model Context Protocol）协议的国家统计局数据获取服务，为AI Agent提供直接访问国家统计局API的功能。项目**同时支持新版API (V2.0)和旧版API**，支持获取各种统计数据，包含关键词搜索、分类浏览、时间维度查询等功能。

### 🆕 新版 API V2.0 (2026.03.27更新)
新版API采用UUID标识符架构，具有以下特点：
- ✅ **UUID标识**: 使用UUID作为唯一标识符，摒弃旧的层级代码系统
- ✅ **三步查询**: 树形导航 → 指标元数据 → 批量取值
- ✅ **时间分片**: 同一指标按5年或统计制度变革周期分割，支持更精细的数据管理
- ✅ **批量查询**: 支持一次性查询多个指标、多个时间点数据
- ✅ **缓存优化**: 内置智能缓存机制，提升查询效率
- ✅ **完整元数据**: 包含统计口径说明、单位信息等关键元数据

### 旧版 API (向后兼容)
- ✅ 关键词搜索：直接搜索获取指标代码及最新值（推荐用于快速查询）
- ✅ 树形分类：可浏览和递归获取所有分类/指标体系
- ✅ 预遍历数据：提供完整的预遍历分类编码体系，可直接读取使用（减少递归调用）
- ✅ 时间范围：可查询各数据库对应可用时间维度
- ✅ 标准API：遵循国家统计局接口文档的全部规范
- ✅ 容错机制：内置重试逻辑、请求延迟、数据验证等功能

## 环境要求
- Node.js 18+
- npm or yarn

## 安装指南
安装所需依赖，请运行以下命令：
```bash
npm install
```

## 服务启动
启动MCP服务器：
```bash
# 构建项目
npm run build

# 启动服务器（STDIO模式 - 适用于Claude Desktop等）
npm start

# 或启动HTTP服务器（端口模式）
node dist/index.js --port 8080
```

## 可用工具

### search_statistics（推荐）
通过关键词搜索国家统计局指标和数据。可以快速查找指标及其最新值。
- 参数：`keyword`（必需）- 搜索关键词，如 "GDP"、"人均可支配收入" 等
- 参数：`db`（可选）- 数据库筛选，空=全部，可选"年度数据"或"季度数据"
- 参数：`page`（可选）- 页码，从0开始

### get_statistics_categories
获取统计指标分类树，返回国家统计局分类体系（第一层）。
- 参数：`dbcode`（必需）- 数据库代码，`wdcode`（可选）- 维度代码

### get_statistics_leaf_categories
递归获取特定数据库的所有叶子指标节点（分类下全部可查询指标）。
- 参数：`dbcode`（必需）- 数据库代码

### get_statistics_time_options
获取指定数据库可选的时间范围维度。
- 参数：`dbcode`（必需）- 数据库代码

### get_statistics_data
获取国家统计局特定指标的数据。
- 参数：`zb`（必需）- 指标代码，`dbcode`（必需）- 数据库代码，`sj`（可选）- 时间范围

### batch_get_statistics
批量获取多个统计指标的数据。
- 参数：`queries`（必需）- 查询参数数组

## 🆕 新版 API V2.0 使用指南

### 核心概念

新版API引入以下关键概念：

| 标识符 | 说明 |
|--------|------|
| **pid** | 父节点ID，用于在目录树中向下展开 |
| **cid** | 数据集ID，代表一个叶子节点（特定指标+地区+时间段） |
| **indicatorId** | 具体指标ID，代表数据集中的某一列 |
| **时间分片** | 同一指标按时间分成多个cid（如2021-2025, 2026-至今） |

### 新版API客户端使用示例

```typescript
import { NewStatsApiClient, CategoryCode } from './src/api-client';

// 创建客户端实例
const client = new NewStatsApiClient();

// 方式一：一步到位查询（推荐）
async function quickQuery() {
  const result = await client.searchAndGet(
    'CPI',                    // 关键词
    '居民消费价格指数',        // 指标名称（可选）
    '202601MM',               // 起始时间（可选）
    '202603MM'                // 结束时间（可选）
  );
  
  console.log('数据集ID:', result.cid);
  console.log('指标信息:', result.indicator);
  console.log('数据:', result.data);
}

// 方式二：分步查询（适合复杂场景）
async function stepByStep() {
  // 1. 搜索定位数据集
  const searchResults = await client.search({ 
    search: 'GDP',
    pageSize: 10 
  });
  
  // 2. 获取树结构（遍历分类）
  const treeNodes = await client.getTree({
    code: CategoryCode.MONTHLY,  // 月度数据
    pid: ''  // 根节点
  });
  
  // 3. 获取指标列表
  const indicators = await client.getIndicators({
    cid: 'your-cid-here'
  });
  
  // 4. 查询数据
  const data = await client.getData({
    cid: 'your-cid-here',
    indicatorIds: ['indicator-id-1', 'indicator-id-2'],
    das: [{ text: '全国', value: '000000000000' }],
    dts: ['202601MM-202612MM']
  });
}

// 方式三：获取所有叶子节点（慎用，耗时）
async function getAllLeafs() {
  const leafs = await client.getAllLeafNodes(CategoryCode.MONTHLY);
  console.log(`共找到 ${leafs.length} 个数据集`);
}
```

### 时间编码格式

新版API使用特定的时间编码格式：

| 类型 | 格式 | 示例 |
|------|------|------|
| 月度 | YYYYMM + MM | 202602MM (2026年2月) |
| 季度 | YYYYQ + SS | 20254SS (2025年第4季度) |
| 年度 | YYYY + YY | 2025YY (2025年) |
| 范围 | Start-End | 202601MM-202612MM |

### 分类代码

```typescript
enum CategoryCode {
  MONTHLY = '1',            // 月度数据
  QUARTERLY = '2',          // 季度数据
  YEARLY = '3',             // 年度数据
  PROVINCE_QUARTERLY = '5', // 分省季度
  PROVINCE_YEARLY = '6',    // 分省年度
  OTHER = '7',              // 其他/普查
}
```

### 最佳实践

1. **优先使用搜索接口**: 用 `search()` 快速定位cid，避免全量遍历树
2. **处理时间分片**: 同一指标可能有多个cid，需按时间拼接数据
3. **批量请求**: `getData()` 支持多个indicatorIds，一次请求获取多个指标
4. **关注元数据**: 查看indicator的`i_mark`字段了解统计口径
5. **利用缓存**: 客户端内置缓存，树结构和指标列表会自动缓存

## 模块介绍
- `src/index.ts`: MCP服务器主入口，实现MCP协议规范
- `src/api-client.ts`: 国家统计局API交互模块，提供完整的数据获取功能
  - **NewStatsApiClient**: 新版API V2.0客户端（推荐）
  - **StatsApiClient**: 旧版API客户端（向后兼容）
- `src/types.ts`: 完整的类型定义，包含新旧两版API的数据结构

## 遵循国家统计局API标准

### 新版 API V2.0
项目严格实现新版API接口规范：
- 搜索接口 `/external/query` 用于关键词搜索和快速定位cid
- 树遍历接口 `/new/queryIndexTreeAsync` 用于浏览分类树和获取cid
- 指标查询接口 `/new/queryIndicatorsByCid` 用于获取指标列表
- 数据查询接口 `/stream/esData` 用于批量获取时间序列数据
- 内置缓存机制：树结构24小时，指标列表12小时
- UUID标识符系统和时间分片机制
- 完整的错误处理和重试逻辑

### 旧版 API (向后兼容)
项目严格实现旧版API接口规范：
- 搜索接口 `/search.htm` 用于关键词查找和快速获取最新值
- 分类接口 `/easyquery.htm` 用于遍历指标分类树
- 数据接口 `/easyquery.htm` 用于查询历史时间序列
- 通过 `k1` 时间戳防缓存参数
- URL编码处理 `wds` 和 `dfwds` 参数
- 数据验证与错误处理最佳实践

## 数据编码对应
- `dbcode.json`: 存储数据库代码及其相应的名称
- `wbcode.json`: 维度代码定义
- **预遍历编码数据**:
  - **npm包中不包含**: `nbs_data_repository/` （因文件体积较大）
  - **需从GitHub获取**: 预先遍历获取的完整的国家统计局分类编码体系（可减少递归调用）
    - 完整数据集在 GitHub 仓库中，请从 [GitHub 仓库](https://github.com/Ddhjx-code/notional_data) 下载
    - `csnd/`, `csyd/`: 城市统计数据（年度、月度）
    - `fsnd/`, `fsyd/`: 分省年度、月度数据
    - `hgnd/`, `hgjd/`, `hgyd/`: 国民经济核算数据（年度、季度、月度）
    - `gjnd/`, `gjyd/`, `gatnd/`, `gatyd/`: 国际、港澳台统计数据（年度、月度）
    - 每个数据库目录下包含预遍历的分类编码（以JSON文件形式存储）:
      - 如 `nbs_data_repository/hgjd/A01.json` 包含A01分类下的具体指标
      - 文件内容格式: `[{"id": "指标ID", "pid": "父级ID", "name": "指标名", "isParent": 是否为父级}]`

## 为AI Agent的使用
本项目专门设计为MCP服务器，可以直接集成到AI Agent系统中，提供国家统计局数据查询能力。Agent可根据使用场景选择最合适的工具：

- **快速查询**：使用 `search_statistics` 直接通过关键词获取指标和最新值
- **分类浏览**：使用 `get_statistics_categories` 获取分类体系；对于完整指标体系，可优先参考 `nbs_data_repository` 目录下的预遍历编码文件
- **递归获取**：`get_statistics_leaf_categories` 用于递归获取所有叶子节点（由于已有预遍历数据，此功能使用频率较低）
- **深度查询**：使用 `get_statistics_time_options` 和 `get_statistics_data` 获取历史序列数据
- **预遍历数据**：`nbs_data_repository` 目录下已预存各类统计数据库的详细分类编码，可直接读取使用，避免实时API递归调用

## 开发
进行开发时可使用：
```bash
npm run dev
```

## 使用建议

对于AI Agent开发者，根据使用方式采用不同策略：

### npm 包使用（核心库）：
1. **安装**: `npm install national-stats-mcp`
2. **功能**: 使用 API 工具进行动态数据查询
3. **使用**: `search_statistics`、`get_statistics_data` 等
4. **递归调用**: 当需要完整分类体系时，使用 `get_statistics_leaf_categories`

### GitHub 仓库使用（完整版本）：
1. **克隆完整仓库**:
   ```bash
   git clone https://github.com/Ddhjx-code/notional_data.git
   ```
2. **优先使用预遍历数据**: 从 `nbs_data_repository` 目录直接读取已存在的分类编码信息
3. **快速查询**: 使用 `search_statistics` 工具进行关键词搜索
4. **实时数据获取**: 使用 `get_statistics_data` 获取具体统计数据
5. **递归调用**: 仅在预遍历数据不满足需求时使用 `get_statistics_leaf_categories`

### 预遍历数据优势（当可访问完整数据集时）：
- ✅ 快速访问：无需等待实时API调用和递归遍历
- ✅ 大数据量：包含国家统计局完整分类体系
- ✅ 稳定性好：离线数据访问不受API限制
- ✅ 减少API调用：降低对国家统计局服务器压力

### 递归API使用场景：
- 临时获取最新指标（若预遍历数据未及时更新）
- 特殊查询需求超出预遍历数据范围
- 在较小环境中仅安装了 npm 包的情况

## 贡献
欢迎对本代码进行修改。请确保遵循项目的编码标准。

## 开源协议
[MIT License](./License)



