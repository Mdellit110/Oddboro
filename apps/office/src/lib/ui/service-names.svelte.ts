// Each service's name by its id, so the line saying what an Odd is doing
// names the service the owner knows ("Listing secret names (AWS Secrets
// Manager)"), not its id. The page fills it with the office's state.
export const serviceNames = $state<{ byId: Record<string, string> }>({ byId: {} });
