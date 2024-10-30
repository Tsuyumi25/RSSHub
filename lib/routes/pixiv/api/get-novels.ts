import got from '../pixiv-got';
import { maskHeader } from '../constants';
import queryString from 'query-string';
import { config } from '@/config';

/**
 * 获取用户小说作品
 * @param {string} user_id 目标用户 id
 * @param {string} token pixiv oauth token
 * @returns {Promise<got.AxiosResponse<{novels: Novel[]}>>}
 */
export default function getNovels(user_id: string, token: string) {
    return got('https://app-api.pixiv.net/v1/user/novels', {
        headers: {
            ...maskHeader,
            Authorization: 'Bearer ' + token,
        },
        searchParams: queryString.stringify({
            user_id,
            filter: 'for_ios',
        }),
    });
}

// 新增：獲取小說全文函數 (使用新版 webview API)
export function getNovelContent(novel_id: string, token: string) {
    return got('https://app-api.pixiv.net/webview/v2/novel', {
        headers: {
            ...maskHeader,
            Authorization: 'Bearer ' + token,
        },
        searchParams: queryString.stringify({
            id: novel_id,
            viewer_version: '20221031_ai',
        }),
    });
}

// 新增：處理小說內容的輔助函數
export function parseNovelContent(response: string): string {
    try {
        // 從回應中提取 novel 對象
        const novelMatch = response.match(/novel:\s*({[\s\S]*?}),\n/);
        if (!novelMatch) {
            return '';
        }
        const novelData = JSON.parse(novelMatch[1]);
        let content = novelData.text || '';

        // 處理圖片替換
        if (novelData.images) {
            // 使用正則表達式匹配所有圖片標記
            content = content.replaceAll(/\[uploadedimage:(\d+)\]/g, (match, imageId) => {
                if (novelData.images[imageId]) {
                    const imageUrl = novelData.images[imageId].urls.original.replace('https://i.pximg.net', config.pixiv.imgProxy || '');
                    return `<img src="${imageUrl}" alt="novel illustration ${imageId}">`;
                }
                return match; // 如果找不到對應的圖片，保留原始標記
            });
        }

        // 基本文本處理
        content = content
            .replaceAll('\n', '<br>')
            .replaceAll(/(<br>){2,}/g, '</p><p>')
            .replaceAll('[newpage]', '<hr>')
            .replaceAll(/\[size=(\d+)\](.*?)\[\/size\]/g, '<span style="font-size:$1px">$2</span>')
            .replaceAll(/\[color=([^\]]+)\](.*?)\[\/color\]/g, '<span style="color:$1">$2</span>')
            .replaceAll(/\[ruby=(.*?)\](.*?)\[\/ruby\]/g, '<ruby>$2<rt>$1</rt></ruby>')
            .replaceAll(/\[b\](.*?)\[\/b\]/g, '<strong>$1</strong>')
            .replaceAll(/\[i\](.*?)\[\/i\]/g, '<em>$1</em>')
            .replaceAll(/\[s\](.*?)\[\/s\]/g, '<del>$1</del>');

        return `<article><p>${content}</p></article>`;
    } catch {
        return '';
    }
}
