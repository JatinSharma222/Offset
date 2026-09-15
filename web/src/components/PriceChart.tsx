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
      const sortedData = [...data]
        .sort((a, b) => a.time - b.time)
        .map((d) => ({ time: d.time as any, value: d.value }));
      seriesRef.current.setData(sortedData);
    }

    // Threshold lines
    if (liquidationPrice) {
      seriesRef.current.createPriceLine({
        price: liquidationPrice,
        color: '#EF4444',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'LIQUIDATION CLIFF',
      });
    }

    if (criticalPrice) {
      seriesRef.current.createPriceLine({
        price: criticalPrice,
        color: '#EF4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'CRITICAL (75% HEDGE)',
      });
    }

    if (dangerPrice) {
      seriesRef.current.createPriceLine({
        price: dangerPrice,
        color: '#F97316',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'DANGER (50% HEDGE)',
      });
    }

    if (warningPrice) {
      seriesRef.current.createPriceLine({
        price: warningPrice,
        color: '#F59E0B',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'WARNING (25% HEDGE)',
      });
    }
  }, [data, liquidationPrice, warningPrice, dangerPrice, criticalPrice]);

  return (
    <div className="relative w-full">
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};
