import { config } from '@/config';

export default {
    getImgs(illust) {
        const images: string[] = [];
        if (illust.meta_pages?.length) {
            for (const page of illust.meta_pages) {
                const original = page.image_urls.original.replace('https://i.pximg.net', config.pixiv.imgProxy);
                images.push(`<p><img src="${original}" width="${page.width}" height="${page.height}" /></p>`);
            }
        } else if (illust.meta_single_page.original_image_url) {
            const original = illust.meta_single_page.original_image_url.replace('https://i.pximg.net', config.pixiv.imgProxy);
            images.push(`<p><img src="${original}" width="${illust.width}" height="${illust.height}" /></p>`);
        }
        return images;
    },
    getNovelImgs(novel) {
        const images: string[] = [];
        if (novel.image_urls?.large) {
            const imageUrl = novel.image_urls.large.replace('https://i.pximg.net', config.pixiv.imgProxy);
            images.push(`<p><img src="${imageUrl}" /></p>`);
        }
        return images;
    },
    getProxiedImageUrl(originalUrl: string): string {
        if (!originalUrl) {
            return '';
        }
        return originalUrl.replace('https://i.pximg.net', config.pixiv.imgProxy || '');
    },
};
