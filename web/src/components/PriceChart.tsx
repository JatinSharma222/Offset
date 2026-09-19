import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineStyle } from 'lightweight-charts';

interface ChartPoint {
  time: number;
  value: number;
}

interface PriceChartProps {
  data: ChartPoint[];
  liquidationPrice?: number;
  warningPrice?: number;
  dangerPrice?: number;
  criticalPrice?: number;
}

type PriceLine = ReturnType<ISeriesApi<'Area'>['createPriceLine']>;

export const PriceChart: React.FC<PriceChartProps> = ({
  data,
  liquidationPrice,
  warningPrice,
  dangerPrice,
  criticalPrice,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const priceLinesRef = useRef<PriceLine[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      timeScale: {
        timeVisible: true,
        borderColor: '#334155',
      },
      rightPriceScale: {
        borderColor: '#334155',
      },
      width: chartContainerRef.current.clientWidth,
      height: 350,
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#60a5fa',
      topColor: 'rgba(96, 165, 250, 0.25)',
      bottomColor: 'rgba(96, 165, 250, 0.02)',
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;

    if (data.length > 0) {
      // Sort and ensure unique timestamps
      const sortedMap = new Map<number, number>();
      for (const d of data) {
        sortedMap.set(d.time, d.value);
      }
      const sortedData = Array.from(sortedMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) => ({ time: time as any, value }));

      seriesRef.current.setData(sortedData);
      chartRef.current?.timeScale().fitContent();
    }

    // Clear previous threshold lines to prevent visual stacking
    for (const line of priceLinesRef.current) {
      try {
        seriesRef.current.removePriceLine(line);
      } catch {
        // Line already detached
      }
    }
    priceLinesRef.current = [];

    // Threshold lines
    if (liquidationPrice) {
      const line = seriesRef.current.createPriceLine({
        price: liquidationPrice,
        color: '#EF4444',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'LIQUIDATION CLIFF',
      });
      priceLinesRef.current.push(line);
    }

    if (criticalPrice) {
      const line = seriesRef.current.createPriceLine({
        price: criticalPrice,
        color: '#EF4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'CRITICAL (75% HEDGE)',
      });
      priceLinesRef.current.push(line);
    }

    if (dangerPrice) {
      const line = seriesRef.current.createPriceLine({
        price: dangerPrice,
        color: '#F97316',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'DANGER (50% HEDGE)',
      });
      priceLinesRef.current.push(line);
    }

    if (warningPrice) {
      const line = seriesRef.current.createPriceLine({
        price: warningPrice,
        color: '#F59E0B',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'WARNING (25% HEDGE)',
      });
      priceLinesRef.current.push(line);
    }
  }, [data, liquidationPrice, warningPrice, dangerPrice, criticalPrice]);

  return (
    <div className="relative w-full">
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};
