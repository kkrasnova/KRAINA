export function computeExplorerLevel(input) {
    if (input.locations_visited >= 100 && input.followers_count >= 500)
        return 5;
    if (input.locations_visited >= 50 && input.routes_created >= 3)
        return 4;
    if (input.locations_visited >= 20 && input.routes_created >= 1)
        return 3;
    if (input.locations_visited >= 5)
        return 2;
    return 1;
}
//# sourceMappingURL=level.js.map