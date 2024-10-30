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

// https://github.com/mikf/gallery-dl/blob/main/gallery_dl/extractor/pixiv.py
// https://github.com/mikf/gallery-dl/commit/db507e30c7431d4ed7e23c153a044ce1751c2847
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

        // https://www.pixiv.help/hc/ja/articles/235584168-小説作品の本文内に使える特殊タグとは
        content = content
            // 處理作者上傳的圖片
            .replaceAll(/\[uploadedimage:(\d+)\]/g, (match, imageId) => {
                const originalUrl = novelData?.images?.[imageId]?.urls?.original;
                if (originalUrl) {
                    const imageUrl = originalUrl.replace('https://i.pximg.net', config.pixiv.imgProxy || '');
                    return `<img src="${imageUrl}" alt="novel illustration ${imageId}">`;
                }
                return match;
            })

            // 處理 pixiv 圖片引用
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

            // 頁面跳轉，但由於 [newpage] 使用 hr 分隔，沒有頁數，沒必要跳轉，所以只顯示文字
            .replaceAll(/\[jump:(\d+)\]/g, '<p>跳轉至第$1頁</p>')

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
