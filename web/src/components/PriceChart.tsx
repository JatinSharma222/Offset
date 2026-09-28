import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineStyle, SeriesMarker, Time } from 'lightweight-charts';

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
  mode?: 'plain' | 'technical';
  hedgeActive?: boolean;
}

type PriceLine = ReturnType<ISeriesApi<'Area'>['createPriceLine']>;

export const PriceChart: React.FC<PriceChartProps> = ({
  data,
  liquidationPrice,
  warningPrice,
  dangerPrice,
  criticalPrice,
  mode = 'plain',
  hedgeActive = false,
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
        textColor: '#9ba0a6',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      timeScale: {
        timeVisible: true,
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      width: chartContainerRef.current.clientWidth,
      height: 370,
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#ffb873',
      topColor: 'rgba(255, 184, 115, 0.25)',
      bottomColor: 'rgba(91, 155, 138, 0.01)',
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

    let sortedData: { time: Time; value: number }[] = [];
    if (data.length > 0) {
      // Sort and ensure unique timestamps
      const sortedMap = new Map<number, number>();
      for (const d of data) {
        sortedMap.set(d.time, d.value);
      }
      sortedData = Array.from(sortedMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) => ({ time: time as Time, value }));

      seriesRef.current.setData(sortedData);
      chartRef.current?.timeScale().fitContent();
    }

    // Set markers if hedge is active
    if (hedgeActive && sortedData.length > 0) {
      const latestPoint = sortedData[sortedData.length - 1];
      const markers: SeriesMarker<Time>[] = [
        {
          time: latestPoint.time,
          position: 'aboveBar',
          color: '#5b9b8a', // patina
          shape: 'arrowDown',
          text: 'protection activated',
        },
      ];
      seriesRef.current.setMarkers(markers);
    } else {
      seriesRef.current.setMarkers([]);
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

    const isPlain = mode === 'plain';

    // The liquidation line: single most visually prominent line in the product
    if (liquidationPrice) {
      const line = seriesRef.current.createPriceLine({
        price: liquidationPrice,
        color: '#e05252', // Bohemian crimson / critical risk
        lineWidth: 3, // Maximally prominent
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: isPlain ? 'CRITICAL LIQUIDATION BARRIER' : 'LIQUIDATION PRICE (CLIFF)',
      });
      priceLinesRef.current.push(line);
    }

    if (criticalPrice) {
      const line = seriesRef.current.createPriceLine({
        price: criticalPrice,
        color: '#e05252',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: isPlain ? 'Critically close' : 'Critical (75% hedge)',
      });
      priceLinesRef.current.push(line);
    }

    if (dangerPrice) {
      const line = seriesRef.current.createPriceLine({
        price: dangerPrice,
        color: '#f5793a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: isPlain ? 'Defense trigger' : 'Danger (50% hedge)',
      });
      priceLinesRef.current.push(line);
    }

    if (warningPrice) {
      const line = seriesRef.current.createPriceLine({
        price: warningPrice,
        color: '#ffb873',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: isPlain ? 'Soft warning' : 'Warning (25% hedge)',
      });
      priceLinesRef.current.push(line);
    }
  }, [data, liquidationPrice, warningPrice, dangerPrice, criticalPrice, mode, hedgeActive]);

  return (
    <div className="relative w-full">
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};
