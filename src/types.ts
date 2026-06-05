// MCP SDK 类型定义
export interface McpServer {
  new (options: {
    name: string;
    version: string;
    capabilities: {
      resources?: Record<string, any>;
      tools?: Record<string, any>;
    };
    instructions?: string;
  }): McpServer;

  tool(
    name: string,
    description: string,
    parameters: any,
    implementation: (args: any) => Promise<any>
  ): void;

  connect(transport: any): Promise<void>;
}

// HTTP Transport 类型定义
export interface SseAndStreamableHttpMcpServerOptions {
  host: string;
  port: number;
  createMcpServer: (context: { headers: Record<string, string> }) => Promise<any>;
}

export interface StdioServerTransport {
  new (): StdioServerTransport;
}

// 为startSseAndStreamableHttpMcpServer定义类型
export type StartHttpServerFn = (options: SseAndStreamableHttpMcpServerOptions) => Promise<void>;

// ============= 新版 API 类型定义 (V2.0) =============

/**
 * 新版API基础URL
 */
export const NEW_API_BASE_URL = 'https://data.stats.gov.cn/dg/website/publicrelease/web/external';

/**
 * 树节点 - 来自 queryIndexTreeAsync
 */
export interface TreeNode {
  _id: string;              // 节点唯一标识,可能是下一层的pid或最终的cid
  name: string;             // 节点名称
  isLeaf: boolean;          // 是否为叶子节点
  treeinfo_globalid?: string; // 全局路径ID
  sdate?: string;           // 起始时间 (仅叶子节点有效)
  edate?: string;           // 结束时间 (仅叶子节点有效)
}

/**
 * 树查询响应
 */
export interface TreeResponse {
  data: TreeNode[];
  success: boolean;
}

/**
 * 指标信息 - 来自 queryIndicatorsByCid
 */
export interface Indicator {
  _id: string;              // 指标唯一ID
  i_showname: string;       // 指标显示名称(含单位)
  i_mark?: string;          // 统计口径说明
  du?: string;              // 单位ID
  dp?: string;              // 精度
  order?: number;           // 排序
}

/**
 * 指标列表响应
 */
export interface IndicatorsResponse {
  data: {
    list: Indicator[];
  };
  success: boolean;
}

/**
 * 地区维度项
 */
export interface RegionDimension {
  text: string;             // 地区名称
  value: string;            // 地区代码 (如 "000000000000" 代表全国)
}

/**
 * 数据值项
 */
export interface DataValue {
  _id: string;              // 指标ID
  i_showname?: string;      // 指标名称
  value?: string;           // 数值
  da_name?: string;         // 地区名称
  du_name?: string;         // 单位名称
}

/**
 * 数据点 - 来自 stream/esData
 */
export interface DataPoint {
  code: string;             // 时间编码 (如 "202602MM")
  name: string;             // 时间显示名称 (如 "2026年2月")
  values: DataValue[];      // 指标值数组
}

/**
 * 数据查询响应
 */
export interface DataResponse {
  data: DataPoint[];
  success: boolean;
  state?: number;
  message?: string;
}

/**
 * 数据查询请求参数
 */
export interface DataQueryParams {
  cid: string;                                    // 数据集ID
  indicatorIds: string[];                         // 指标ID数组
  das: RegionDimension[];                         // 地区维度数组
  dts: string[];                                  // 时间范围数组
  showType?: string;                              // 显示类型,默认"1"
  rootId?: string;                                // 根节点ID
}

/**
 * 搜索结果项 - 来自 /external/query
 */
export interface SearchItem {
  show_name: string;        // 显示名称
  type_text: string;        // 数据类型 (如 "月度数据")
  treeinfo_globalid?: string; // 全局路径ID
  cid?: string;             // 数据集ID
  sdate?: string;           // 起始时间
  edate?: string;           // 结束时间
}

/**
 * 搜索响应
 */
export interface SearchResponse {
  data: {
    data: SearchItem[];
    total?: number;
  };
  success?: boolean;
}

/**
 * 树查询参数
 */
export interface TreeQueryParams {
  pid?: string;             // 父节点ID,首次请求可为空
  code: string;             // 顶级分类代码 (1:月度, 2:季度, 3:年度, 5:分省季度, 6:分省年度, 7:其他)
}

/**
 * 指标查询参数
 */
export interface IndicatorQueryParams {
  cid: string;              // 数据集ID
  dt?: string;              // 时间过滤
  name?: string;            // 指标名称过滤
}

/**
 * 搜索查询参数
 */
export interface SearchQueryParams {
  search: string;           // 搜索关键词
  pagenum?: number;         // 页码,默认1
  pageSize?: number;        // 每页数量,默认10
}

/**
 * 时间编码格式枚举
 */
export enum TimeFormat {
  MONTHLY = 'MM',           // 月度: YYYYMM, 后缀 MM
  QUARTERLY = 'SS',         // 季度: YYYYQ, 后缀 SS
  YEARLY = 'YY',            // 年度: YYYY, 后缀 YY
}

/**
 * 分类代码枚举
 */
export enum CategoryCode {
  MONTHLY = '1',            // 月度数据
  QUARTERLY = '2',          // 季度数据
  YEARLY = '3',             // 年度数据
  PROVINCE_QUARTERLY = '5', // 分省季度
  PROVINCE_YEARLY = '6',    // 分省年度
  OTHER = '7',              // 其他/普查
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  treeTTL?: number;         // 树结构缓存时间(毫秒),默认24小时
  indicatorsTTL?: number;   // 指标列表缓存时间(毫秒),默认12小时
  dataTTL?: number;         // 数据缓存时间(毫秒),默认1小时
}

/**
 * API客户端配置
 */
export interface NewApiClientConfig {
  baseUrl?: string;         // API基础URL
  timeout?: number;         // 请求超时时间(毫秒)
  cache?: CacheConfig;      // 缓存配置
  rootId?: string;          // 根节点ID
}