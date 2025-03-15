import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
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

describe('估價生成器基本測試', () => {
	beforeEach(() => {
		// 設置測試環境
		process.env.NODE_ENV = 'test';
	});
	
	it('應該響應表單 HTML (單元風格)', async () => {
		const request = new Request('http://example.com', {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
				'CF-Connecting-IP': '127.0.0.1',
				'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
			}
		});
		// 創建一個空的上下文傳遞給 `worker.fetch()`
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// 等待所有傳遞給 `ctx.waitUntil()` 的 `Promise` 在運行測試斷言之前解決
		await waitOnExecutionContext(ctx);
		const html = await response.text();
		expect(html).toContain('<form');
		expect(html).toContain('method="POST"');
	});

	it('應該響應表單 HTML (整合風格)', async () => {
		const response = await SELF.fetch('http://example.com', {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
				'CF-Connecting-IP': '127.0.0.1',
				'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
			}
		});
		const html = await response.text();
		expect(html).toContain('<form');
		expect(html).toContain('method="POST"');
	});
});
