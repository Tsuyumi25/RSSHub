import { Route, Data, DataItem } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import InvalidParameterError from '@/errors/types/invalid-parameter';

const CATEGORY_MAP = {
    '': 'All',
    '1': 'Info',
    '2': 'Release',
    '3': 'Live',
    '4': 'Event',
    '5': 'Tv',
    '6': 'Radio',
    '7': 'Magazine',
    '8': 'Web/Mobile',
    '9': 'Goods',
    '10': 'Fan Club',
} as const;

export const route: Route = {
    path: '/:category?',
    categories: ['anime'],
    example: '/soundhorizon/2',
    parameters: {
        category: {
            description: 'Category',
            options: Object.entries(CATEGORY_MAP).map(([key, value]) => ({
                value: key,
                label: value,
            })),
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Information',
    maintainers: ['SnowAgar25'],
    handler,
};

async function handler(ctx): Promise<Data> {
    const category = ctx.req.param('category') || '';

    if (!Object.keys(CATEGORY_MAP).includes(category)) {
        throw new InvalidParameterError(`No such category: ${category}`);
    }

    const baseUrl = 'https://www.soundhorizon.com';
    const informationUrl = `${baseUrl}/information/index.php${category && `?cate=${category}`}`;

    const response = await ofetch(informationUrl);
    const $ = load(response);

    const list = $('.topinfolist li')
        .toArray()
        .map((item) => {
            const $item = $(item);
            const link = baseUrl + $item.find('a').attr('href');
            const title = $item.find('strong').text().trim();
            const dateText = $item.find('span').text().trim();

            return {
                title,
                link,
                pubDate: parseDate(dateText),
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await ofetch(item.link);
                const $detail = load(detailResponse);

                return {
                    title: item.title,
                    description: $detail('.infodetailtxt').html() || '',
                    link: item.link,
                    pubDate: item.pubDate,
                    category: category && [CATEGORY_MAP[category]],
                };
            })
        )
    );

    return {
        title: `Sound Horizon - ${CATEGORY_MAP[category]}`,
        link: informationUrl,
        item: items as DataItem[],
    };
}
