'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Listing } from '@iskotify/utils'
import { FilterBar } from './FilterBar'
import { ListingCard } from './ListingCard'
import Image from 'next/image'

type Props = {
  listings: Listing[]
  limit?: number
}

export function ListingGrid({ listings, limit }: Props) {
  const [filtered, setFiltered] = useState(listings)

  const displayList = limit ? filtered.slice(0, limit) : filtered
  const hasMore = limit !== undefined && filtered.length > limit

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Image src="/kuya-baw-waving.png" alt="Kuya Baw" width={64} height={64} className="opacity-40 mb-4" />
        <p className="font-heading font-bold text-lg text-[#1d1d1f]">No listings yet</p>
        <p className="text-sm text-[#6e6e73] mt-1">Check back soon — new opportunities are added weekly.</p>
      </div>
    )
  }

  return (
    <>
      {!limit && <FilterBar listings={listings} onFilter={setFiltered} />}
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {displayList.length === 0 ? (
          <p className="col-span-full text-center text-[#6e6e73] py-12">No listings match your filter.</p>
        ) : (
          displayList.map(l => <ListingCard key={l.id} listing={l} />)
        )}
      </div>
      {hasMore && (
        <div className="flex justify-center pb-8">
          <Link
            href="/listings"
            className="inline-flex items-center gap-2 bg-[#800000] text-white rounded-[980px] px-6 py-3 text-sm font-medium font-body hover:bg-[#a00000] transition-colors shadow-sm"
          >
            View All Listings →
          </Link>
        </div>
      )}
    </>
  )
}
