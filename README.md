This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Data use policy

Torn's API Terms of Service ask every tool to say how it uses the API keys
and data it handles. This site's policy is in
[`app/data-policy.ts`](app/data-policy.ts), and the login form shows it under
"How we use your key".

In short, this site has no server. Your key and the faction IDs you enter are
kept in your browser's `localStorage`. The key is sent only to `api.torn.com` and
to FF Scouter.

## Getting Started

First, run the development server:

```bash
bun install
bun dev
```

Run the tests with `bun test`.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# TODO

Things I want to add

- Add a count of members above and below a person in the tooltip
- Add a box around the other faction's lines showing who the 4.0-2.5 targets are
- Make the easy and possible numbers configurable with fields
