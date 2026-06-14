export function computeExplorerLevel(input: {
  locations_visited: number;
  routes_created: number;
  followers_count: number;
}): number {
  if (input.locations_visited >= 100 && input.followers_count >= 500) return 5;
  if (input.locations_visited >= 50 && input.routes_created >= 3) return 4;
  if (input.locations_visited >= 20 && input.routes_created >= 1) return 3;
  if (input.locations_visited >= 5) return 2;
  return 1;
}
