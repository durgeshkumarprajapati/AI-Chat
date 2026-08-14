'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  avatarUrl?: string | null;
}

export interface WeatherData {
  city: string;
  temperature: number;
  feelsLike: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  high: number;
  low: number;
  observedAt: string;
}

export type AuthStatus = 'LOADING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';
export type LocationStatus = 'prompt' | 'granted' | 'denied' | 'loading';

interface WorkspaceContextType {
  currentUser: UserProfile | null;
  authStatus: AuthStatus;
  activeCity: string;
  activeRegion: string;
  weather: WeatherData | null;
  weatherLoading: boolean;
  locationStatus: LocationStatus;
  updateCity: (_city: string, _region?: string) => Promise<void>;
  requestGeolocation: () => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const DEFAULT_CITY = 'Vadodara';
export const DEFAULT_REGION = 'Gujarat';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('LOADING');

  const [activeCity, setActiveCity] = useState<string>(DEFAULT_CITY);
  const [activeRegion, setActiveRegion] = useState<string>(DEFAULT_REGION);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('prompt');

  // Race condition guard for weather requests
  const weatherRequestIdRef = useRef<number>(0);

  // Fetch weather for a given city with race condition protection
  const fetchWeatherForCity = useCallback(async (city: string) => {
    const requestId = ++weatherRequestIdRef.current;
    setWeatherLoading(true);
    try {
      const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
      const data = await res.json();

      // Only update if this request is still the latest one
      if (requestId === weatherRequestIdRef.current) {
        if (data.success && data.data) {
          setWeather(data.data);
        } else {
          // Safe fallback weather
          setWeather({
            city,
            temperature: 28,
            feelsLike: 30,
            condition: 'Partly Cloudy',
            humidity: 60,
            windSpeed: 12,
            high: 32,
            low: 24,
            observedAt: new Date().toISOString()
          });
        }
      }
    } catch {
      if (requestId === weatherRequestIdRef.current) {
        setWeather({
          city,
          temperature: 28,
          feelsLike: 30,
          condition: 'Partly Cloudy',
          humidity: 60,
          windSpeed: 12,
          high: 32,
          low: 24,
          observedAt: new Date().toISOString()
        });
      }
    } finally {
      if (requestId === weatherRequestIdRef.current) {
        setWeatherLoading(false);
      }
    }
  }, []);

  // Update active city state atomically
  const updateCity = useCallback(async (city: string, region?: string) => {
    const trimmedCity = city ? city.trim() : DEFAULT_CITY;
    const targetCity = trimmedCity || DEFAULT_CITY;
    const targetRegion = region || (targetCity === 'Vadodara' ? 'Gujarat' : 'India');

    setActiveCity(targetCity);
    setActiveRegion(targetRegion);

    // Save to user-scoped storage if user logged in, otherwise global storage
    if (typeof window !== 'undefined') {
      const storageKey = currentUser ? `docai_user_${currentUser.id}_preferred_city` : 'docai_preferred_city';
      localStorage.setItem(storageKey, targetCity);
      localStorage.setItem('docai_preferred_city', targetCity); // fallback sync
    }

    // Immediately trigger weather update
    await fetchWeatherForCity(targetCity);
  }, [currentUser, fetchWeatherForCity]);

  // Refresh current user from server session
  const refreshUser = useCallback(async () => {
    setAuthStatus('LOADING');
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();

      if (data.authenticated && data.user) {
        setCurrentUser(data.user);
        setAuthStatus('AUTHENTICATED');

        // Resolve user-scoped preferred city
        if (typeof window !== 'undefined') {
          const userScopedCity = localStorage.getItem(`docai_user_${data.user.id}_preferred_city`);
          const fallbackCity = localStorage.getItem('docai_preferred_city') || DEFAULT_CITY;
          const initialCity = userScopedCity || fallbackCity;
          setActiveCity(initialCity);
          fetchWeatherForCity(initialCity);
        }
      } else {
        setCurrentUser(null);
        setAuthStatus('UNAUTHENTICATED');
      }
    } catch {
      setCurrentUser(null);
      setAuthStatus('UNAUTHENTICATED');
    }
  }, [fetchWeatherForCity]);

  // Handle Logout
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}

    // Reset user state
    setCurrentUser(null);
    setAuthStatus('UNAUTHENTICATED');

    // Reset city and weather to clean defaults
    setActiveCity(DEFAULT_CITY);
    setActiveRegion(DEFAULT_REGION);
    setWeather(null);

    // Clear session storage & transient state
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
    }

    router.push('/login');
  }, [router]);

  // Geolocation request
  const requestGeolocation = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationStatus('denied');
      return;
    }

    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/location/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
          const data = await res.json();
          if (data.success && data.data) {
            const loc = data.data;
            await updateCity(loc.city, loc.region);
            setLocationStatus('granted');
          } else {
            setLocationStatus('denied');
          }
        } catch {
          setLocationStatus('denied');
        }
      },
      () => {
        setLocationStatus('denied');
      },
      { timeout: 8000 }
    );
  }, [updateCity]);

  // Initial mount load
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <WorkspaceContext.Provider
      value={{
        currentUser,
        authStatus,
        activeCity,
        activeRegion,
        weather,
        weatherLoading,
        locationStatus,
        updateCity,
        requestGeolocation,
        refreshUser,
        logout
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
