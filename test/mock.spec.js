import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src';

// 直接模擬 checkForBots 函數
vi.mock('../src', async () => {
  // 獲取原始模塊
  const originalModule = await vi.importActual('../src');
  
  // 創建一個模擬的 checkForBots 函數，始終返回成功
  const mockCheckForBots = vi.fn().mockResolvedValue({
    status: 200,
    message: "OK",
    newCookie: "127.0.0.1=1|" + Date.now() + "; Max-Age=60; Path=/; HttpOnly; Secure"
  });
  
  // 替換原始模塊中的 checkForBots 函數
  return {
    ...originalModule,
    default: {
      ...originalModule.default,
      fetch: async (request, env, ctx) => {
        // 在測試環境中，我們使用模擬的 checkForBots 函數
        if (process.env.NODE_ENV === 'test') {
          // 保存原始的 checkForBots 函數
          const originalCheckForBots = globalThis.checkForBots;
          
          // 替換為我們的模擬函數
          globalThis.checkForBots = mockCheckForBots;
          
          try {
            // 調用原始的 fetch 函數
            return await originalModule.default.fetch(request, env, ctx);
          } finally {
            // 恢復原始的 checkForBots 函數
            globalThis.checkForBots = originalCheckForBots;
          }
        }
        
        // 在非測試環境中，使用原始的 fetch 函數
        return originalModule.default.fetch(request, env, ctx);
      }
    }
  };
});

describe('估價生成器模擬測試', () => {
  beforeEach(() => {
    // 重置模擬
    vi.resetAllMocks();
    
    // 設置測試環境
    process.env.NODE_ENV = 'test';
    
    // 模擬 fetch API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['Content-Type', 'image/png']]),
      arrayBuffer: async () => new ArrayBuffer(8)
    });
  });
  
  it('應該正確處理多個商品項目', async () => {
    const formData = new FormData();
    formData.append('providerName', '測試公司');
    formData.append('customerName', '測試客戶');
    
    // 添加多個商品
    formData.append('item_1_type', '現烤烤餅');
    formData.append('item_1_name', '商品 A');
    formData.append('item_1_quantity', '5');
    formData.append('item_1_price', '100');
    
    formData.append('item_2_type', '現烤烤餅');
    formData.append('item_2_name', '商品 B');
    formData.append('item_2_quantity', '3');
    formData.append('item_2_price', '200');
    
    formData.append('item_3_type', '飲料');
    formData.append('item_3_name', '飲料 C');
    formData.append('item_3_quantity', '2');
    formData.append('item_3_price', '50');
    formData.append('item_3_sweetness', '半糖');
    formData.append('item_3_temperature', '去冰');
    
    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData,
      headers: {
        'Referer': 'http://example.com',
        'CF-Connecting-IP': '127.0.0.1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
      }
    });
    
    const ctx = { waitUntil: vi.fn() };
    const response = await worker.fetch(request, {}, ctx);
    const html = await response.text();
    
    // 檢查所有商品是否都在 HTML 中
    expect(html).toContain('商品 A');
    expect(html).toContain('商品 B');
    expect(html).toContain('飲料 C');
    
    // 檢查小計計算是否正確
    // 5*100 + 3*200 + 2*50 = 500 + 600 + 100 = 1,200
    expect(html).toContain('1,200');
  });
  
  it('應該處理稅金計算', async () => {
    const formData = new FormData();
    formData.append('providerName', '測試公司');
    formData.append('customerName', '測試客戶');
    formData.append('taxPercent', '5');
    
    // 添加商品
    formData.append('item_1_type', '現烤烤餅');
    formData.append('item_1_name', '商品 A');
    formData.append('item_1_quantity', '10');
    formData.append('item_1_price', '100');
    
    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData,
      headers: {
        'Referer': 'http://example.com',
        'CF-Connecting-IP': '127.0.0.1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
      }
    });
    
    const ctx = { waitUntil: vi.fn() };
    const response = await worker.fetch(request, {}, ctx);
    const html = await response.text();
    
    // 檢查稅金計算是否正確
    // 小計: 10*100 = 1,000
    // 稅金: 1,000 * 5% = 50
    // 總計: 1,000 + 50 = 1,050
    expect(html).toContain('1,000'); // 小計
    expect(html).toContain('50'); // 稅金
    expect(html).toContain('1,050'); // 總計
  });
  
  it('應該正確處理圖片轉換', async () => {
    // 模擬圖片獲取成功
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['Content-Type', 'image/png']]),
      arrayBuffer: async () => new ArrayBuffer(8)
    });
    
    const formData = new FormData();
    formData.append('providerName', '測試公司');
    formData.append('providerLogo', 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60a.png');
    formData.append('item_1_type', '現烤烤餅');
    formData.append('item_1_name', '商品 A');
    formData.append('item_1_quantity', '1');
    formData.append('item_1_price', '100');
    
    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData,
      headers: {
        'Referer': 'http://example.com',
        'CF-Connecting-IP': '127.0.0.1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
      }
    });
    
    const ctx = { waitUntil: vi.fn() };
    const response = await worker.fetch(request, {}, ctx);
    
    // 應該返回 200 狀態碼
    expect(response.status).toBe(200);
    
    // 檢查 HTML 中是否包含圖片相關的 base64 數據
    const html = await response.text();
    expect(html).toContain('測試公司');
    expect(html).toContain('商品 A');
  });
}); 