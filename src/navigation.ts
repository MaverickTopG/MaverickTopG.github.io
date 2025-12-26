import { getPermalink, getAsset } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'App',
      href: getPermalink('/app'),
    },
    {
      text: 'Pricing',
      href: getPermalink('/pricing'),
    },
    {
      text: 'About Us',
      href: getPermalink('/about'),
    },
    {
      text: 'Admin Portal',
      href: '/admin/login',
    },
  ],
  actions: [
    {
      text: 'Get the App',
      href: 'https://apps.apple.com/th/app/nexolink/id6636497206?platform=iphone',
      target: '_blank',
    },
  ],
};

export const footerData = {
  links: [
    {
      title: 'NexoLink',
      links: [
        { text: 'App', href: getPermalink('/app') },
        { text: 'Pricing', href: getPermalink('/pricing') },
        { text: 'About Us', href: getPermalink('/about') },
        { text: 'Admin Portal', href: '/admin/login' },
      ],
    },
    {
      title: 'Experience',
      links: [
        { text: 'Volunteer Command Center', href: getPermalink('/#features') },
        { text: 'Impact Reporting', href: getPermalink('/#impact') },
        { text: 'Recognition Moments', href: getPermalink('/#features') },
      ],
    },
    {
      title: 'Resources',
      links: [
        { text: 'Privacy Policy', href: getPermalink('/privacy') },
        { text: 'Terms', href: getPermalink('/terms') },
      ],
    },
  ],
  secondaryLinks: [
    { text: 'Terms', href: getPermalink('/terms') },
    { text: 'Privacy Policy', href: getPermalink('/privacy') },
  ],
  socialLinks: [
    {
      ariaLabel: 'App Store',
      icon: 'tabler:brand-apple',
      href: 'https://apps.apple.com/th/app/nexolink/id6636497206?platform=iphone',
    },
  ],
  footNote: `
    &copy; 2025 NexoLink. Designed with purpose and community at heart.
  `,
};
