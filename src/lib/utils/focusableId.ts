import { page } from '$app/stores';

export function focusableId(element: HTMLElement, id: string) {
    const unsubscribe = page.subscribe(page => {
        if (page.url.hash.length < 2) return;
        if (page.url.hash.substring(1) === id) {
            element.tabIndex = -1;
            element.focus({
                preventScroll: false
            });
        }
    });

    return {
        destroy() {
            unsubscribe();
        }
    };
}