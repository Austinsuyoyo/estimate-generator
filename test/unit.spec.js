import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src';

// 模擬全局 fetch 函數
global.fetch = vi.fn();

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

describe('估價生成器單元測試', () => {
  beforeEach(() => {
    // 重置模擬
    vi.resetAllMocks();
    
    // 設置測試環境
    process.env.NODE_ENV = 'test';
    
    // 模擬 fetch API
    global.fetch.mockResolvedValue({
      ok: true,
      headers: new Map([['Content-Type', 'image/png']]),
      arrayBuffer: async () => new ArrayBuffer(8)
    });
  });

  // 測試 formatNumber 函數
  describe('formatNumber 函數', () => {
    it('應該正確格式化數字', async () => {
      // 由於 formatNumber 是內部函數，我們需要通過暴露的 API 間接測試
      const mockFormData = new FormData();
      mockFormData.append('item_1_type', '現烤烤餅');
      mockFormData.append('item_1_name', '測試商品');
      mockFormData.append('item_1_quantity', '1000');
      mockFormData.append('item_1_price', '1500');
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查格式化的數字是否出現在 HTML 中
      expect(html).toContain('1,500'); // 價格
      expect(html).toContain('1,500,000'); // 小計
    });
    
    it('應該正確處理小數點', async () => {
      const mockFormData = new FormData();
      mockFormData.append('item_1_type', '現烤烤餅');
      mockFormData.append('item_1_name', '測試商品');
      mockFormData.append('item_1_quantity', '10.5');  // 小數點數量
      mockFormData.append('item_1_price', '100.75');   // 小數點價格
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查格式化的數字是否出現在 HTML 中，應該向下取整
      expect(html).toContain('10'); // 數量應該向下取整
      expect(html).toContain('100'); // 價格應該向下取整
      expect(html).toContain('1,000'); // 小計應該是 10 * 100 = 1000
    });
  });
  
  // 測試 templateReplace 函數
  describe('templateReplace 函數', () => {
    it('應該正確替換模板變數', async () => {
      const mockFormData = new FormData();
      mockFormData.append('providerName', '測試公司');
      mockFormData.append('customerName', '測試客戶');
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查模板變數是否被正確替換
      expect(html).toContain('測試公司');
      expect(html).toContain('測試客戶');
    });
    
    it('應該處理不存在的變數', async () => {
      const mockFormData = new FormData();
      mockFormData.append('providerName', '測試公司');
      // 故意不添加 customerName
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查模板變數是否被正確替換
      expect(html).toContain('測試公司');
      // customerName 應該被替換為空字符串
      expect(html).not.toContain('{{customerName}}');
    });
  });
  
  // 測試 processRemarks 函數
  describe('processRemarks 函數', () => {
    it('應該正確處理備註中的變數', async () => {
      const mockFormData = new FormData();
      mockFormData.append('remarks', '送貨日期：{{deliveryDate}}，星期{{deliveryDay}}');
      mockFormData.append('deliveryDate', '2023-03-15');
      mockFormData.append('deliveryDay', '三');
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查備註中的變數是否被正確替換
      expect(html).toContain('送貨日期：2023-03-15，星期三');
    });
    
    it('應該處理多行備註', async () => {
      const mockFormData = new FormData();
      mockFormData.append('remarks', '第一行\n第二行\n第三行');
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查換行是否被轉換為 <br>
      expect(html).toContain('第一行<br>第二行<br>第三行');
    });
  });
  
  // 測試 processItemsData 函數
  describe('processItemsData 函數', () => {
    it('應該正確處理多個商品項目', async () => {
      const mockFormData = new FormData();
      
      // 添加多個商品
      mockFormData.append('item_1_type', '現烤烤餅');
      mockFormData.append('item_1_name', '商品 A');
      mockFormData.append('item_1_quantity', '5');
      mockFormData.append('item_1_price', '100');
      
      mockFormData.append('item_2_type', '現烤烤餅');
      mockFormData.append('item_2_name', '商品 B');
      mockFormData.append('item_2_quantity', '3');
      mockFormData.append('item_2_price', '200');
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查商品是否正確顯示
      expect(html).toContain('商品 A');
      expect(html).toContain('商品 B');
      expect(html).toContain('5'); // 數量
      expect(html).toContain('3'); // 數量
      expect(html).toContain('100'); // 價格
      expect(html).toContain('200'); // 價格
      expect(html).toContain('500'); // 小計 A
      expect(html).toContain('600'); // 小計 B
      expect(html).toContain('1,100'); // 總計
    });
    
    it('應該處理飲料的自定義選項', async () => {
      const mockFormData = new FormData();
      
      mockFormData.append('item_1_type', '飲料');
      mockFormData.append('item_1_name', '珍珠奶茶');
      mockFormData.append('item_1_quantity', '2');
      mockFormData.append('item_1_price', '50');
      mockFormData.append('item_1_sweetness', '半糖');
      mockFormData.append('item_1_temperature', '去冰');
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查飲料是否正確顯示
      expect(html).toContain('珍珠奶茶');
      expect(html).toContain('飲料');
      expect(html).toContain('2'); // 數量
      expect(html).toContain('50'); // 價格
      expect(html).toContain('100'); // 小計
    });
  });
  
  // 測試稅金計算
  describe('稅金計算', () => {
    it('應該正確計算稅金和總計', async () => {
      const mockFormData = new FormData();
      mockFormData.append('taxPercent', '5');
      
      mockFormData.append('item_1_type', '現烤烤餅');
      mockFormData.append('item_1_name', '商品 A');
      mockFormData.append('item_1_quantity', '10');
      mockFormData.append('item_1_price', '100');
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查稅金計算是否正確
      expect(html).toContain('1,000'); // 小計
      expect(html).toContain('50'); // 稅金 (5%)
      expect(html).toContain('1,050'); // 總計
    });
    
    it('當稅率為 0 時應顯示「內含」', async () => {
      const mockFormData = new FormData();
      mockFormData.append('taxPercent', '0');
      
      mockFormData.append('item_1_type', '現烤烤餅');
      mockFormData.append('item_1_name', '商品 A');
      mockFormData.append('item_1_quantity', '10');
      mockFormData.append('item_1_price', '100');
      
      const mockRequest = new Request('http://example.com', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const ctx = { waitUntil: vi.fn() };
      const response = await worker.fetch(mockRequest, {}, ctx);
      const html = await response.text();
      
      // 檢查稅金顯示是否正確
      expect(html).toContain('1,000'); // 小計
      expect(html).toContain('內含'); // 稅金顯示為「內含」
      expect(html).toContain('1,000'); // 總計
    });
  });
}); 