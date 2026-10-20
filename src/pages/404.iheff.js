import wixSeoFrontend from 'wix-seo-frontend';

$w.onReady(async function () {
    await wixSeoFrontend.setMetaTags([
        { property: 'og:title', content: 'Page Not Found | Cyth Systems' }
    ]);
});
