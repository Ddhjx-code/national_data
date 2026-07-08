#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startSseAndStreamableHttpMcpServer } from 'mcp-http-server';
import { NewStatsApiClient } from './api-client';
import { CategoryCode, RegionDimension } from './types';
import { z } from 'zod';
import { Command } from 'commander';

// 获取版本号
const VERSION = '2.0.0';

// 创建新版API客户端实例
const apiClient = new NewStatsApiClient();

// 31省 das 常量
const PROVINCE_LIST: RegionDimension[] = [
  { text: '北京', value: '110000000000' },
  { text: '天津', value: '120000000000' },
  { text: '河北', value: '130000000000' },
  { text: '山西', value: '140000000000' },
  { text: '内蒙古', value: '150000000000' },
  { text: '辽宁', value: '210000000000' },
  { text: '吉林', value: '220000000000' },
  { text: '黑龙江', value: '230000000000' },
  { text: '上海', value: '310000000000' },
  { text: '江苏', value: '320000000000' },
  { text: '浙江', value: '330000000000' },
  { text: '安徽', value: '340000000000' },
  { text: '福建', value: '350000000000' },
  { text: '江西', value: '360000000000' },
  { text: '山东', value: '370000000000' },
  { text: '河南', value: '410000000000' },
  { text: '湖北', value: '420000000000' },
  { text: '湖南', value: '430000000000' },
  { text: '广东', value: '440000000000' },
  { text: '广西', value: '450000000000' },
  { text: '海南', value: '460000000000' },
  { text: '重庆', value: '500000000000' },
  { text: '四川', value: '510000000000' },
  { text: '贵州', value: '520000000000' },
  { text: '云南', value: '530000000000' },
  { text: '西藏', value: '540000000000' },
  { text: '陕西', value: '610000000000' },
  { text: '甘肃', value: '620000000000' },
  { text: '青海', value: '630000000000' },
  { text: '宁夏', value: '640000000000' },
  { text: '新疆', value: '650000000000' },
];

// 全国
const NATIONAL: RegionDimension = { text: '全国', value: '000000000000' };

/**
 * 根据 region 参数构造 das 数组
 */
function buildDas(region?: string): RegionDimension[] {
  if (!region || region === '全国' || region === 'all') {
    return [NATIONAL];
  }
  if (region === '31省' || region === '分省' || region === 'provinces') {
    return PROVINCE_LIST;
  }
  // 支持单个省名或逗号分隔的多个省名
  const names = region.split(',').map(s => s.trim());
  const result: RegionDimension[] = [];
  for (const name of names) {
    if (name === '全国') {
      result.push(NATIONAL);
      continue;
    }
    const found = PROVINCE_LIST.find(p => p.text === name || p.text === name.replace(/[市省区]$/, ''));
    if (found) {
      result.push(found);
    } else {
      // 尝试模糊匹配
      const fuzzy = PROVINCE_LIST.find(p => p.text.includes(name) || name.includes(p.text));
      if (fuzzy) {
        result.push(fuzzy);
      }
    }
  }
  return result.length > 0 ? result : [NATIONAL];
}

/**
 * 确定 showType: 多地区用 "2"（按地区分组），单地区用 "1"（按时间分组）
 */
function getShowType(das: RegionDimension[]): string {
  return das.length > 1 ? '2' : '1';
}

// 创建MCP服务器
export const server = new McpServer({
  name: 'national-stats-mcp',
  version: VERSION,
  description: '国家统计局数据查询API (V2.0 新版)'
});

// 设置服务器instructions
(server as any).instructions = `
    该服务主要用于帮助用户查询国家统计局的统计数据（使用V2.0新版API）。

    主要工具包括：
    - search_statistics: 通过关键词搜索数据集，获取cid
    - browse_tree: 浏览指标分类树，支持月度/季度/年度/分省数据
    - get_indicators: 根据cid获取可用指标列表
    - get_data: 获取具体统计数据（支持全国/分省/指定省份）
    - search_and_get: 一步到位：搜索 + 获取数据（适合全国数据的简单查询）

    使用流程：
    1. 用 search_statistics 搜索关键词找到 cid
    2. 用 get_indicators 获取该 cid 下的指标 ID
    3. 用 get_data 传入 cid、indicatorIds、时间范围和地区获取数据

    快捷方式：
    - search_and_get 可以一步完成上述流程（适合全国数据的简单查询）
    - browse_tree 可以浏览完整的分类体系

    =====================
    分省数据获取方法（重要）
    =====================

    搜索接口有一个隐藏逻辑：搜索关键词中必须包含具体省份名，才能触发分省数据的搜索结果。

    获取分省数据的正确流程：
    1. 搜索时在关键词前加一个省份名，如 "北京gdp"、"广东省CPI"
       - 搜 "GDP" → 只返回全国数据
       - 搜 "北京gdp" → 返回分省年度数据（type_value=6）
    2. 从搜索结果中筛选 type_value="6"（分省年度）或 "5"（分省季度）的项，获取 cid
    3. 用 get_data 传入该 cid + region="31省"，即可一次获取全部31省数据

    注意事项：
    - cid 是跨省通用的：通过"北京gdp"搜到的 cid，配合31省 das 可以返回所有省份数据
    - code 参数是后置过滤器：只筛选已命中的结果类型，不改变搜索逻辑
    - search_and_get 不适合分省查询，请使用 search_statistics + get_data 组合

    示例：获取2025年31省GDP
    1. search_statistics(keyword="北京gdp") → 找到 type_value=6 的结果，cid=6f8fbd...
    2. get_data(cid="6f8fbd...", indicatorIds=[...], dts="2025YY-2025YY", region="31省")
    =====================

    地区参数说明（region）：
    - "全国" 或不传: 查全国数据
    - "31省" 或 "分省": 查所有31省数据
    - "北京" / "广东" 等: 查单个省份
    - "北京,上海,广东": 逗号分隔查多个省份

    时间格式说明（dts）：
    - 年度: "2020YY-2024YY"
    - 季度: "2024ASS-2025BSS" (A=1季度, B=2季度, C=3季度, D=4季度)
    - 月度: "202401MM-202412MM"

    分类代码（code）：
    - 1: 月度数据
    - 2: 季度数据
    - 3: 年度数据
    - 5: 分省季度数据
    - 6: 分省年度数据
    - 7: 其他/普查数据

    搜索结果字段说明：
    - type_value: 数据类型代码（1=月度, 2=季度, 3=年度, 5=分省季度, 6=分省年度, 8=城市年度）
    - da: 地区代码（000000000000=全国, 110000000000=北京, 440000000000=广东...）
    - da_name: 地区名称
  `;

// ====== 工具1: 搜索数据集 ======
server.tool(
  'search_statistics',
  '通过关键词搜索国家统计局数据集，返回匹配的数据集及其cid。用于定位要查询的数据。',
  {
    keyword: z.string().describe('搜索关键词，如 "GDP"、"CPI"、"人口"、"居民消费价格" 等'),
    pageSize: z.number().optional().default(10).describe('每页结果数，默认10'),
    pagenum: z.number().optional().default(1).describe('页码，从1开始'),
  },
  async (args: { keyword: string; pageSize?: number; pagenum?: number }) => {
    const { keyword, pageSize = 10, pagenum = 1 } = args;
    try {
      const results = await apiClient.search({ search: keyword, pageSize, pagenum });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              count: results.length,
              results: results.map(r => ({
                name: r.show_name,
                type: r.type_text,
                type_value: r.type_value || null,
                cid: r.cid || null,
                globalid: r.treeinfo_globalid,
                da: r.da || null,
                da_name: r.da_name || null,
                timeRange: r.sdate && r.edate ? `${r.sdate} - ${r.edate}` : null,
              }))
            }, null, 2)
          }
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// ====== 工具2: 浏览分类树 ======
server.tool(
  'browse_tree',
  '浏览国家统计局指标分类树。可逐层钻取获取子节点，叶子节点的_id即为cid。',
  {
    code: z.string().default('3').describe('分类代码: 1=月度, 2=季度, 3=年度, 5=分省季度, 6=分省年度, 7=其他'),
    pid: z.string().optional().describe('父节点ID，不传则获取顶层节点'),
  },
  async (args: { code: string; pid?: string }) => {
    const { code, pid } = args;
    try {
      const nodes = await apiClient.getTree({ code, pid });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              count: nodes.length,
              nodes: nodes.map(n => ({
                id: n._id,
                name: n.name,
                isLeaf: n.isLeaf,
                timeRange: n.sdate && n.edate ? `${n.sdate} - ${n.edate}` : n.sdate || null,
              }))
            }, null, 2)
          }
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// ====== 工具3: 获取指标列表 ======
server.tool(
  'get_indicators',
  '根据cid获取数据集下的所有可用指标（含指标ID、名称、单位、统计口径）。',
  {
    cid: z.string().describe('数据集ID（从搜索结果或树节点的_id获取）'),
  },
  async (args: { cid: string }) => {
    const { cid } = args;
    try {
      const indicators = await apiClient.getIndicators({ cid });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              cid,
              count: indicators.length,
              indicators: indicators.map(ind => ({
                id: ind._id,
                name: ind.i_showname,
                mark: ind.i_mark || null,
                order: ind.order,
              }))
            }, null, 2)
          }
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// ====== 工具4: 获取数据（核心工具）======
server.tool(
  'get_data',
  '获取统计数据。支持全国/31省/指定省份。需提供cid和indicatorIds（通过get_indicators获取）。',
  {
    cid: z.string().describe('数据集ID'),
    indicatorIds: z.array(z.string()).describe('指标ID数组（从get_indicators获取）'),
    dts: z.string().describe('时间范围，如 "2020YY-2024YY"（年度）、"202401MM-202412MM"（月度）'),
    region: z.string().optional().default('全国').describe('地区: "全国"(默认), "31省"/"分省"(全部省份), "北京"(单省), "北京,上海,广东"(多省逗号分隔)'),
  },
  async (args: { cid: string; indicatorIds: string[]; dts: string; region?: string }) => {
    const { cid, indicatorIds, dts, region } = args;
    try {
      const das = buildDas(region);
      const showType = getShowType(das);

      const data = await apiClient.getData({
        cid,
        indicatorIds,
        das,
        dts: [dts],
        showType,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              query: { cid, indicatorIds, dts, region: region || '全国', showType },
              count: data.length,
              data: data.map(d => ({
                code: d.code,
                name: d.name,
                values: d.values.map(v => ({
                  indicator: v.i_showname || v._id,
                  value: v.value,
                  region: v.da_name || d.name,
                  unit: v.du_name,
                }))
              }))
            }, null, 2)
          }
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// ====== 工具5: 搜索并获取数据（快捷工具）======
server.tool(
  'search_and_get',
  '一步到位：根据关键词搜索 → 定位cid → 获取指标 → 查询数据。适合快速查询。支持指定地区。',
  {
    keyword: z.string().describe('搜索关键词，如 "GDP"、"人口"、"CPI"'),
    indicatorName: z.string().optional().describe('指标名称过滤（模糊匹配），不传则取第一个指标'),
    startTime: z.string().optional().describe('起始时间，如 "2020YY"、"202401MM"'),
    endTime: z.string().optional().describe('结束时间，如 "2024YY"、"202412MM"'),
    region: z.string().optional().default('全国').describe('地区: "全国"(默认), "31省", "北京", "北京,上海,广东"'),
  },
  async (args: { keyword: string; indicatorName?: string; startTime?: string; endTime?: string; region?: string }) => {
    const { keyword, indicatorName, startTime, endTime, region } = args;
    try {
      // 1. 搜索定位cid
      const searchResults = await apiClient.search({ search: keyword, pageSize: 10 });

      if (!searchResults || searchResults.length === 0) {
        throw new Error(`未找到与 "${keyword}" 相关的数据集`);
      }

      // 优先选择最新的数据集
      const target = searchResults.reduce((latest, current) => {
        if (!latest.edate) return current;
        if (!current.edate) return latest;
        return current.edate > latest.edate ? current : latest;
      });

      // 提取 cid
      const cid = target.cid || extractCidFromGlobalId(target.treeinfo_globalid);
      if (!cid) {
        throw new Error('无法从搜索结果中提取 cid');
      }

      // 2. 获取指标列表
      const indicators = await apiClient.getIndicators({ cid });
      if (!indicators || indicators.length === 0) {
        throw new Error(`cid ${cid} 下没有找到指标`);
      }

      // 筛选指标
      let targetIndicator = indicatorName
        ? indicators.find(ind => ind.i_showname.includes(indicatorName))
        : indicators[0];

      if (!targetIndicator) {
        throw new Error(`未找到包含 "${indicatorName}" 的指标。可用指标: ${indicators.map(i => i.i_showname).join(', ')}`);
      }

      // 3. 构造时间范围
      const timeRange = startTime && endTime
        ? `${startTime}-${endTime}`
        : `${target.sdate || '2020'}YY-${target.edate || '2024'}YY`;

      // 4. 构造地区维度
      const das = buildDas(region);
      const showType = getShowType(das);

      // 5. 查询数据
      const data = await apiClient.getData({
        cid,
        indicatorIds: [targetIndicator._id],
        das,
        dts: [timeRange],
        showType,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              dataset: target.show_name,
              cid,
              indicator: {
                id: targetIndicator._id,
                name: targetIndicator.i_showname,
                mark: targetIndicator.i_mark || null,
              },
              timeRange,
              region: region || '全国',
              count: data.length,
              data: data.map(d => ({
                code: d.code,
                name: d.name,
                values: d.values.map(v => ({
                  indicator: v.i_showname || targetIndicator!.i_showname,
                  value: v.value,
                  region: v.da_name || d.name,
                  unit: v.du_name,
                }))
              }))
            }, null, 2)
          }
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// ====== 工具6: 获取省份列表 ======
server.tool(
  'list_provinces',
  '获取31省份代码列表，用于了解可用的地区参数。',
  {},
  async () => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            national: NATIONAL,
            provinces: PROVINCE_LIST,
            usage: '在 get_data 和 search_and_get 的 region 参数中使用省份名称，如 "北京" 或 "31省"'
          }, null, 2)
        }
      ],
    };
  }
);

/**
 * 从 globalid 提取 cid (最后一段)
 */
function extractCidFromGlobalId(globalId?: string): string | null {
  if (!globalId) return null;
  const parts = globalId.split('.');
  return parts[parts.length - 1] || null;
}

// 启动服务器
async function startServer() {
  const program = new Command();

  program
    .option('-p, --port <number>', 'Port to listen on for HTTP/SSE mode')
    .option('-h, --host <host>', 'Host to listen on for HTTP/SSE mode', 'localhost')
    .parse();

  const options = program.opts();

  if (options.port) {
    await startSseAndStreamableHttpMcpServer({
      host: options.host,
      port: parseInt(options.port),
      createMcpServer: async ({ headers }) => {
        return server;
      },
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default server;
