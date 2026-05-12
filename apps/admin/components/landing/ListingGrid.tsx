'use client'

import { useState } from 'react'
import type { Listing } from '@iskotify/utils'
import { FilterBar } from './FilterBar'
import { ListingCard } from './ListingCard'
import Image from 'next/image'

export function ListingGrid({ listings }: { listings: Listing[] }) {
  const [filtered, setFiltered] = useState(listings)

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Image src="/kuya-baw-mascot.svg" alt="Kuya Baw" width={64} height={64} className="opacity-40 mb-4" />
        <p className="font-heading font-bold text-lg text-[#1d1d1f]">No listings yet</p>
        <p className="text-sm text-[#6e6e73] mt-1">Check back soon — check back soon.</p>
      </div>
    )
  }

  return (
    <>
      <FilterBar listings={listings} onFilter={setFiltered} />
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.length === 0 ? (
          <p className="col-span-full text-center text-[#6e6e73] py-12">No listings match your filter.</p>
        ) : (
          filtered.map(l => <ListingCard key={l.id} listing={l} />)
        )}
      </div>
    </>
  )
}
