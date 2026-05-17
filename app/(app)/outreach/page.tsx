import { OutreachPageClient } from '@/components/outreach/outreach-page-client'

interface Props {
  searchParams: Promise<{ link_ext?: string }>
}

export default async function OutreachPage({ searchParams }: Props) {
  const params = await searchParams
  return <OutreachPageClient extensionLinkParam={params.link_ext} />
}
