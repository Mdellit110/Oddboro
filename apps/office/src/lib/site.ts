// The public site, for links to its guides: the site's dev server under a
// developer's `npm run dev`, oddboro.com everywhere else (`siteUrl` in
// vite.config.ts). Outside Vite, as under `node --test`, it is oddboro.com.
export const SITE_URL: string =
  typeof __SITE_URL__ === 'string' ? __SITE_URL__ : 'https://oddboro.com';

/** A page on the public site, by its path, such as `/connectors/aws-sign-in/`. */
export const siteLink = (path: string): string => `${SITE_URL}${path}`;

/** The site's guide for each AWS tool, which a connect step links to. */
export const AWS_GUIDES: Record<string, { path: string; label: string }> = {
  'aws-secrets': {
    path: '/connectors/aws-secrets/',
    label: 'Set up AWS Secrets Manager for Oddboro'
  },
  'aws-read': { path: '/connectors/aws-read/', label: 'Set up AWS read only for Oddboro' },
  'aws-build': { path: '/connectors/aws-build/', label: 'Set up AWS builder for Oddboro' }
};
