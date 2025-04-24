import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";

function PieChart({ data, title, refresh }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const [isDarkMode, setIsDarkMode] = useState(false);
  // Check if dark mode is active
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.body.classList.contains("dark-theme"));
    };
    // Check initial state
    checkDarkMode();
    // Create a MutationObserver to watch for class changes on the body
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          checkDarkMode();
        }
      });
    });
    // Start observing the body
    observer.observe(document.body, { attributes: true });
    // Cleanup the observer on component unmount
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // If we don't have any data, don't render the chart
    if (!data || data.length === 0) return;

    // If a chart already exists, destroy it before creating a new one
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Create the chart
    const ctx = chartRef.current.getContext("2d");

    // Extract labels and values from data
    const labels = data.map((item) => item.domain);
    const values = data.map((item) => item.time);

    // Generate random colors for each domain
    // We use HSL to ensure good contrast and brightness
    const colors = data.map((_, i) => {
      const hue = (i * 137.5) % 360; // Use golden angle to spread colors evenly

      return isDarkMode
        ? `hsl(${hue}, 85%, 70%)` // Brighter, more saturated colors for dark mode
        : `hsl(${hue}, 70%, 65%)`; // Standard colors for light mode
    });

    // Generate darker hover colors
    const hoverColors = colors.map((color) => {
      return isDarkMode
        ? color.replace("70%", "60%") // Darker hover effect for dark mode
        : color.replace("65%", "55%"); // Standard hover effect for light mode
    });

    chartInstance.current = new Chart(ctx, {
      type: "pie",
      data: {
        labels: labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            hoverBackgroundColor: hoverColors,
            borderWidth: 1,
            borderColor: isDarkMode ? "#333" : "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: !!title,
            text: title,
            font: {
              size: 16,
              weight: "bold",
            },
            color: isDarkMode ? "#e0e0e0" : "#333",
          },
          legend: {
            position: "right",
            labels: {
              boxWidth: 15,
              font: {
                size: 12,
              },
              color: isDarkMode ? "#e0e0e0" : "#333",
              // Truncate very long domain names
              generateLabels: (chart) => {
                const original =
                  Chart.overrides.pie.plugins.legend.labels.generateLabels;
                const labels = original.call(this, chart);

                return labels.map((label) => {
                  if (label.text.length > 20) {
                    label.text = label.text.substring(0, 17) + "...";
                  }
                  return label;
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                // Format label to show domain and time
                const label = context.label || "";
                const value = context.formattedValue || "";
                const dataset = context.dataset || {};
                const total = dataset.data.reduce((acc, val) => acc + val, 0);
                const percentage = Math.round((context.raw / total) * 100);

                return `${label}: ${value} (${percentage}%)`;
              },
            },
          },
          backgroundColor: isDarkMode
            ? "rgba(30, 30, 30, 0.9)"
            : "rgba(255, 255, 255, 0.9)",
          titleColor: isDarkMode ? "#e0e0e0" : "#333",
          bodyColor: isDarkMode ? "#e0e0e0" : "#333",
          borderColor: isDarkMode ? "#444" : "#ddd",
          borderWidth: 1,
        },
      },
    });

    // Cleanup function to destroy chart when component unmounts
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [refresh, isDarkMode]);

  return (
    <div className="pie-chart-container">
      <canvas ref={chartRef}></canvas>
    </div>
  );
}

export default PieChart;
