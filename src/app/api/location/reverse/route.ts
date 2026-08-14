import { NextRequest, NextResponse } from 'next/server';
import { locationService } from '@/features/location/location.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const lat = Number(searchParams.get('lat') || 22.3072);
    const lon = Number(searchParams.get('lon') || 73.1812);

    const location = await locationService.reverseGeocode(lat, lon);

    return NextResponse.json({
      success: true,
      data: location
    });
  } catch {
    return NextResponse.json({
      success: true,
      data: {
        city: 'Vadodara',
        region: 'Gujarat',
        country: 'India',
        latitude: 22.3072,
        longitude: 73.1812
      }
    });
  }
}
