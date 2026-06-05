import axios from 'axios';
import { z } from 'zod';

// 定义国家统计局API响应结构
export interface StatsApiResponse {
  returncode: number;
  returndata: {
    hasdatacount: number;
    datanodes: Array<{
      code: string;
      data: {
        data: number | string;
        dotcount: number;
        hasdata: boolean;
        strdata: string;
      };
      wds: Array<{
        valuecode: string;
        wdcode: string;
      }>;
    }>;
    wdnodes: Array<{
      wdcode: string;
      wdname: string;
      nodes: Array<{
        code: string;
        name: string;
        unit: string;
        dotcount?: number;
      }>;
    }>;
  };
}

// 搜索API响应结构
export interface StatsSearchResult {
  pagecount: number;
  pagecurrent: number;
  result: Array<{
    data: string;
    db: string;
    reg: string;
    sj: string;
    zb: string;
    report: string;
  }>;
}

// 搜索结果解析
export interface ParsedSearchResult {
  name: string;  // 指标名称
  value: string;  // 最新值
  time: string;   // 时间
  db: string;     // 数据库类型
  zbCode: string; // 指标code
  cnCode: string; // cn code (B01/C01)
  dbcode: string; // 数据库code (hgjd/hgnd)
  sjCode: string; // 时间code
}

// 定义分类API响应结构
export type CategoryResponse = Array<{
  id: string;
  pid: string | number;
  name: string;
  isParent: boolean;
  dbcode: string;
  wdcode: string;
}>;

// 定义时间维度响应结构
export interface TimeDimensionResponse {
  returncode: number;
  returndata: Array<{
    wdcode: string;
    wdname: string;
    issj: boolean;
    selcode: string;
    nodes: Array<{
      code: string;
      name: string;
    }>;
  }>;
}

// 国家统计局API客户端
export class StatsApiClient {
  private baseUrl = 'https://data.stats.gov.cn';
  private cnMap: Record<string, string> = {
    'B01': 'hgjd',  // 季度
    'C01': 'hgnd',  // 年度
  };

  /**
   * 搜索指标
   */
  async search(keyword: string, db: string = '', page: number = 0): Promise<StatsSearchResult> {
    // 使用 axios 的 params 选项来避免编码问题
    const params = {
      s: keyword,      // 让 axios 正确处理编码
      m: 'searchdata',
      db,
      p: page.toString(),
    };

    console.error(`GET Request URL (base): ${this.baseUrl}/search.htm with params:`, JSON.stringify(params));

    try {
      const response = await axios.get<StatsSearchResult>(`${this.baseUrl}/search.htm`, { params });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API search request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  /**
   * 解析搜索结果
   */
  parseSearchResult(result: StatsSearchResult): ParsedSearchResult[] {
    return result.result.map(item => {
      // 解析 report 字段获取参数
      const reportParams = Object.fromEntries(
        item.report.split('&').map(p => {
          const [key, value] = p.split('=');
          return [key, value] as [string, string];
        })
      );

      // 确定数据库类型
      const cnCode = reportParams.cn || 'B01'; // 默认为季度数据
      const dbcode = this.cnMap[cnCode] || 'hgjd';

      return {
        name: item.zb,
        value: item.data,
        time: item.sj,
        db: item.db,
        zbCode: reportParams.zb || '',
        cnCode,
        dbcode,
        sjCode: reportParams.sj || ''
      };
    });
  }

  /**
   * 获取指标分类树
   */
  async getCategories(dbcode: string, wdcode: string = 'zb'): Promise<CategoryResponse> {
    const params = {
      m: 'getTree',
      id: 'zb',  // 从指标根节点开始
      dbcode,
      wdcode
    };

    console.error(`POST Request URL: ${this.baseUrl}/easyquery.htm`);
    console.error(`POST Request Body:`, JSON.stringify(params));

    try {
      const response = await axios.post<CategoryResponse>(`${this.baseUrl}/easyquery.htm`, new URLSearchParams(params));
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API category request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  /**
   * 递归获取指标分类树的所有叶子节点（包含子节点）
   */
  async getLeafCategories(dbcode: string): Promise<CategoryResponse> {
    let allLeaves: CategoryResponse = [];

    const getRecursively = async (nodeId: string) => {
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          // 添加延迟避免请求过于频繁
          await new Promise(resolve => setTimeout(resolve, 200));

          const categoryResp = await this.getTreeSpecificNode(nodeId, dbcode);

          for (const node of categoryResp) {
            if (!node.isParent) {
              allLeaves.push(node);
            } else {
              await getRecursively(node.id);
            }
          }
          return;
        } catch (error) {
          retries++;
          console.error(`Category request failed for node ${nodeId}, attempt ${retries}/${maxRetries}.`);
          if (retries >= maxRetries) {
            throw error;
          }
          // 延迟重试
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    };

    await getRecursively('zb');
    return allLeaves;
  }

  /**
   * 获取特定ID的分类节点
   */
  private async getTreeSpecificNode(id: string, dbcode: string, wdcode: string = 'zb'): Promise<CategoryResponse> {
    const params = {
      m: 'getTree',
      id,
      dbcode,
      wdcode
    };

    console.error(`POST Request URL: ${this.baseUrl}/easyquery.htm`);
    console.error(`POST Request Body:`, JSON.stringify(params));

    try {
      const response = await axios.post<CategoryResponse>(`${this.baseUrl}/easyquery.htm`, new URLSearchParams(params));
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API getTree request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  /**
   * 获取时间维度信息
   */
  async getTimeDimensions(dbcode: string): Promise<TimeDimensionResponse> {
    const wds = '[]';

    const params = {
      m: 'getOtherWds',
      dbcode,
      rowcode: 'zb',
      colcode: 'sj',
      wds,
      k1: Date.now(), // 添加时间戳防止缓存
      h: 1
    };

    console.error(`GET Request URL: ${this.baseUrl}/easyquery.htm with params:`, JSON.stringify(params));

    try {
      const response = await axios.get<TimeDimensionResponse>(`${this.baseUrl}/easyquery.htm`, { params });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API time dimension request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  /**
   * 获取统计数据
   */
  async getData(zb: string, dbcode: string, sj: string = 'LAST30'): Promise<StatsApiResponse> {
    const wds = JSON.stringify([{ "wdcode": "zb", "valuecode": zb }]);
    const dfwds = JSON.stringify([{ "wdcode": "sj", "valuecode": sj }]);

    // 使用axios的params选项，让axios自动处理参数编码（避免双重编码问题）
    const params = {
      m: 'QueryData',
      dbcode,
      rowcode: 'zb',
      colcode: 'sj',
      wds, // 不进行手动URL编码，交给axios处理
      dfwds, // 不进行手动URL编码，交给axios处理
      k1: Date.now(), // 添加时间戳防止缓存
      h: 1
    };

    console.error(`GET Request URL: ${this.baseUrl}/easyquery.htm with params:`, JSON.stringify(params));

    try {
      const response = await axios.get<StatsApiResponse>(`${this.baseUrl}/easyquery.htm`, { params });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API query data request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  /**
   * 批量获取数据
   */
  async batchGet(queryParams: Array<{ zb: string; dbcode: string; sj: string }>): Promise<Array<{
    query: { zb: string; dbcode: string; sj: string };
    result: StatsApiResponse | null;
    error?: string;
  }>> {
    const results = [];

    for (const param of queryParams) {
      try {
        const result = await this.getData(param.zb, param.dbcode, param.sj);
        results.push({
          query: param,
          result,
          error: undefined
        });
      } catch (error) {
        results.push({
          query: param,
          result: null,
          error: (error as Error).message
        });
      }
    }

    return results;
  }
}

// ============= 新版 API 客户端 (V2.0) =============

import {
  NEW_API_BASE_URL,
  TreeResponse,
  TreeNode,
  IndicatorsResponse,
  Indicator,
  DataResponse,
  DataQueryParams,
  SearchResponse as NewSearchResponse,
  SearchItem,
  TreeQueryParams,
  IndicatorQueryParams,
  SearchQueryParams,
  CategoryCode,
  NewApiClientConfig,
  DataPoint,
} from './types';

/**
 * 简单的内存缓存实现
 */
class SimpleCache<T> {
  private cache = new Map<string, { data: T; expireAt: number }>();
  
  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expireAt) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  
  set(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      expireAt: Date.now() + ttl,
    });
  }
  
  clear(): void {
    this.cache.clear();
  }
}

/**
 * 新版国家统计局API客户端 (V2.0)
 * 基于UUID标识符的新架构
 */
export class NewStatsApiClient {
  private baseUrl: string;
  private timeout: number;
  private rootId: string;
  
  // 缓存实例
  private treeCache: SimpleCache<TreeNode[]>;
  private indicatorsCache: SimpleCache<Indicator[]>;
  
  // 默认配置
  private readonly DEFAULT_TREE_TTL = 24 * 60 * 60 * 1000; // 24小时
  private readonly DEFAULT_INDICATORS_TTL = 12 * 60 * 60 * 1000; // 12小时
  
  constructor(config?: NewApiClientConfig) {
    this.baseUrl = config?.baseUrl || NEW_API_BASE_URL;
    this.timeout = config?.timeout || 30000;
    this.rootId = config?.rootId || 'fc982599aa684be7969d7b90b1bd0e84'; // 月度数据根节点
    
    // 初始化缓存
    this.treeCache = new SimpleCache();
    this.indicatorsCache = new SimpleCache();
  }
  
  /**
   * 搜索数据集
   * 用于快速定位 cid
   */
  async search(params: SearchQueryParams): Promise<SearchItem[]> {
    const url = new URL(`${this.baseUrl}/query`);
    url.searchParams.set('search', params.search);
    url.searchParams.set('pagenum', (params.pagenum || 1).toString());
    url.searchParams.set('pageSize', (params.pageSize || 10).toString());
    
    console.error(`Search Request: ${url.toString()}`);
    
    try {
      const response = await axios.get<NewSearchResponse>(url.toString(), {
        timeout: this.timeout,
      });
      
      return response.data.data?.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Search request failed: ${error.response?.data || error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * 获取树结构
   * 用于遍历目录树,获取叶子节点(cid)
   */
  async getTree(params: TreeQueryParams): Promise<TreeNode[]> {
    // 检查缓存
    const cacheKey = `tree_${params.code}_${params.pid || 'root'}`;
    const cached = this.treeCache.get(cacheKey);
    if (cached) {
      console.error(`Tree cache hit for ${cacheKey}`);
      return cached;
    }
    
    const url = new URL(`${this.baseUrl}/new/queryIndexTreeAsync`);
    if (params.pid) {
      url.searchParams.set('pid', params.pid);
    }
    url.searchParams.set('code', params.code);
    
    console.error(`Tree Request: ${url.toString()}`);
    
    try {
      const response = await axios.get<TreeResponse>(url.toString(), {
        timeout: this.timeout,
      });
      
      const nodes = response.data.data || [];
      
      // 缓存结果
      this.treeCache.set(cacheKey, nodes, this.DEFAULT_TREE_TTL);
      
      return nodes;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Tree request failed: ${error.response?.data || error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * 递归获取所有叶子节点(cid)
   * 注意:此方法耗时较长,慎用
   */
  async getAllLeafNodes(code: CategoryCode): Promise<TreeNode[]> {
    const allLeaves: TreeNode[] = [];
    
    const getRecursively = async (pid?: string) => {
      try {
        // 添加延迟避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const nodes = await this.getTree({ pid, code });
        
        for (const node of nodes) {
          if (node.isLeaf) {
            allLeaves.push(node);
          } else {
            await getRecursively(node._id);
          }
        }
      } catch (error) {
        console.error(`Error in recursive tree traversal for pid=${pid}:`, error);
        throw error;
      }
    };
    
    await getRecursively();
    return allLeaves;
  }
  
  /**
   * 获取指标列表
   * 根据 cid 获取所有可用指标
   */
  async getIndicators(params: IndicatorQueryParams): Promise<Indicator[]> {
    // 检查缓存
    const cacheKey = `indicators_${params.cid}`;
    const cached = this.indicatorsCache.get(cacheKey);
    if (cached) {
      console.error(`Indicators cache hit for ${cacheKey}`);
      return cached;
    }
    
    const url = new URL(`${this.baseUrl}/new/queryIndicatorsByCid`);
    url.searchParams.set('cid', params.cid);
    if (params.dt) {
      url.searchParams.set('dt', params.dt);
    }
    if (params.name) {
      url.searchParams.set('name', params.name);
    }
    
    console.error(`Indicators Request: ${url.toString()}`);
    
    try {
      const response = await axios.get<IndicatorsResponse>(url.toString(), {
        timeout: this.timeout,
      });
      
      const indicators = response.data.data?.list || [];
      
      // 缓存结果
      this.indicatorsCache.set(cacheKey, indicators, this.DEFAULT_INDICATORS_TTL);
      
      return indicators;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Indicators request failed: ${error.response?.data || error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * 查询数据
   * 批量获取多个指标、多个时间点的数据
   */
  async getData(params: DataQueryParams): Promise<DataPoint[]> {
    const payload = {
      cid: params.cid,
      indicatorIds: params.indicatorIds,
      das: params.das,
      dts: params.dts,
      showType: params.showType || '1',
      rootId: params.rootId || this.rootId,
    };
    
    console.error(`Data Request: ${this.baseUrl}/stream/esData`);
    console.error(`Payload:`, JSON.stringify(payload, null, 2));

    try {
      const response = await axios.post<DataResponse>(
        `${this.baseUrl}/stream/esData`,
        payload,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.data.success) {
        throw new Error('Data query failed: API returned success=false');
      }
      
      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Data request failed: ${error.response?.data || error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * 辅助方法: 搜索并获取数据
   * 一步到位:搜索关键词 -> 获取cid -> 获取指标 -> 查询数据
   */
  async searchAndGet(
    keyword: string,
    indicatorName?: string,
    startTime?: string,
    endTime?: string
  ): Promise<{
    cid: string;
    indicator: Indicator;
    data: DataPoint[];
  }> {
    // 1. 搜索定位cid
    const searchResults = await this.search({ search: keyword, pageSize: 10 });
    
    if (!searchResults || searchResults.length === 0) {
      throw new Error(`No results found for keyword: ${keyword}`);
    }
    
    // 优先选择最新的数据集(通过edate判断)
    const target = searchResults.reduce((latest, current) => {
      if (!latest.edate) return current;
      if (!current.edate) return latest;
      return current.edate > latest.edate ? current : latest;
    });
    
    // 从 globalid 提取 cid (如果搜索结果没有直接提供cid)
    const cid = target.cid || this.extractCidFromGlobalId(target.treeinfo_globalid);
    
    if (!cid) {
      throw new Error('Failed to extract cid from search result');
    }
    
    // 2. 获取指标列表
    const indicators = await this.getIndicators({ cid });
    
    if (!indicators || indicators.length === 0) {
      throw new Error(`No indicators found for cid: ${cid}`);
    }
    
    // 筛选目标指标
    let targetIndicator: Indicator | undefined;
    if (indicatorName) {
      targetIndicator = indicators.find(ind => 
        ind.i_showname.includes(indicatorName)
      );
    } else {
      targetIndicator = indicators[0]; // 默认取第一个
    }
    
    if (!targetIndicator) {
      throw new Error(`Indicator not found: ${indicatorName}`);
    }
    
    // 3. 查询数据
    const timeRange = startTime && endTime 
      ? `${startTime}-${endTime}` 
      : `${target.sdate || '202001'}MM-${target.edate || '202612'}MM`;
    
    const data = await this.getData({
      cid,
      indicatorIds: [targetIndicator._id],
      das: [{ text: '全国', value: '000000000000' }],
      dts: [timeRange],
    });
    
    return {
      cid,
      indicator: targetIndicator,
      data,
    };
  }
  
  /**
   * 辅助方法: 从 globalid 提取 cid (最后一段)
   */
  private extractCidFromGlobalId(globalId?: string): string | null {
    if (!globalId) return null;
    const parts = globalId.split('.');
    return parts[parts.length - 1] || null;
  }
  
  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.treeCache.clear();
    this.indicatorsCache.clear();
  }
  
  /**
   * 设置根节点ID
   */
  setRootId(rootId: string): void {
    this.rootId = rootId;
  }
  
  /**
   * 获取当前根节点ID
   */
  getRootId(): string {
    return this.rootId;
  }
}