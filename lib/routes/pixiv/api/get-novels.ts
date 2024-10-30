import got from '../pixiv-got';
import { maskHeader } from '../constants';
import queryString from 'query-string';
import { config } from '@/config';
import { load } from 'cheerio';

export interface PixivNovel {
    id: string;
    title: string;
    caption: string;
    restrict: number;
    x_restrict: number;
    is_original: boolean;
    image_urls: {
        square_medium: string;
        medium: string;
        large: string;
    };
    create_date: string;
    tags: Array<{
        name: string;
        translated_name: string | null;
        added_by_uploaded_user: boolean;
    }>;
    page_count: number;
    text_length: number;
    user: {
        id: number;
        name: string;
        account: string;
        profile_image_urls: {
            medium: string;
        };
    };
    series?: {
        id?: number;
        title?: string;
    };
    total_bookmarks: number;
    total_view: number;
    total_comments: number;
}

export interface PixivResponse {
    data: {
        novels: PixivNovel[];
    };
}

interface NovelData {
    text: string;
    images?: {
        [key: string]: {
            urls: {
                original: string;
            };
        };
    };
}
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

// https://www.pixiv.help/hc/ja/articles/235584168-%E5%B0%8F%E8%AA%AC%E4%BD%9C%E5%93%81%E3%81%AE%E6%9C%AC%E6%96%87%E5%86%85%E3%81%AB%E4%BD%BF%E3%81%88%E3%82%8B%E7%89%B9%E6%AE%8A%E3%82%BF%E3%82%B0%E3%81%A8%E3%81%AF
export function parseNovelContent(response: string): string {
    try {
        const $ = load(response);

        // 從 script 標籤中提取 pixiv 對象
        let novelData: NovelData | undefined;

        $('script').each((_, script) => {
            const content = $(script).html() || '';
            if (content.includes("Object.defineProperty(window, 'pixiv'")) {
                const match = content.match(/novel:\s*({[\s\S]*?}),\s*isOwnWork/);
                if (match) {
                    try {
                        novelData = JSON.parse(match[1]);
                    } catch (error) {
                        throw new Error(`Failed to parse novel data: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        });

        if (!novelData?.text) {
            return '';
        }

        let content = novelData.text;

        content = content
            // 1. 處理上傳的圖片
            .replaceAll(/\[uploadedimage:(\d+)\]/g, (match, imageId) => {
                const originalUrl = novelData?.images?.[imageId]?.urls?.original;
                if (originalUrl) {
                    const imageUrl = originalUrl.replace('https://i.pximg.net', config.pixiv.imgProxy || '');
                    return `<img src="${imageUrl}" alt="novel illustration ${imageId}">`;
                }
                return match;
            })

            // 2. 處理 pixiv 圖片引用
            .replaceAll(/\[pixivimage:(\d+)(?:-(\d+))?\]/g, (match, illustId, pageNum) => {
                const imageUrl = `${config.pixiv.imgProxy || ''}/i/${illustId}${pageNum ? `_p${pageNum}` : ''}.jpg`;
                return `<img src="${imageUrl}" alt="pixiv illustration ${illustId}${pageNum ? ` page ${pageNum}` : ''}">`;
            })

            // 基本換行和段落
            .replaceAll('\n', '<br>')
            .replaceAll(/(<br>){2,}/g, '</p><p>')

            // ruby 標籤處理
            .replaceAll(/\[\[rb:(.*?)>(.*?)\]\]/g, '<ruby>$1<rt>$2</rt></ruby>')

            // 連結處理
            .replaceAll(/\[\[jumpuri:(.*?)>(.*?)\]\]/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

            // 章節標題
            .replaceAll(/\[chapter:(.*?)\]/g, '<h2>$1</h2>')

            // 其他格式
            .replaceAll('[newpage]', '<hr>');

        // 使用 cheerio 進行最後的 HTML 清理
        const $content = load(`<article><p>${content}</p></article>`);

        // 優化嵌套段落處理
        $content('p p').each((_, elem) => {
            const $elem = $content(elem);
            $elem.replaceWith($elem.html() || '');
        });

        // 確保標題標籤位置正確
        $content('p h2').each((_, elem) => {
            const $elem = $content(elem);
            const $parent = $elem.parent('p');
            const html = $elem.prop('outerHTML');
            if ($parent.length && html) {
                $parent.replaceWith(`</p>${html}<p>`);
            }
        });

        return $content.html() || '';
    } catch (error) {
        throw new Error(`Error parsing novel content: ${error instanceof Error ? error.message : String(error)}`);
    }
}
