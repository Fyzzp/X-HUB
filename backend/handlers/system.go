package handlers

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type SystemStats struct {
	CPU       CPUStats        `json:"cpu"`
	Memory    MemoryStats     `json:"memory"`
	Disk      DiskStats       `json:"disk"`
	Network   NetworkStats    `json:"network"`
	LoadAvg   LoadAverage     `json:"load_avg"`
	Uptime    string          `json:"uptime"`
	ConnCount ConnectionStats `json:"connections"`
	OSInfo    OSInfo          `json:"os"
	"os/exec"`
}

type CPUStats struct {
	Cores       int     `json:"cores"`
	UsedPercent float64 `json:"used_percent"`
	Model       string  `json:"model"`
}

type MemoryStats struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Available   uint64  `json:"available"`
	UsedPercent float64 `json:"used_percent"`
}

type DiskStats struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Available   uint64  `json:"available"`
	UsedPercent float64 `json:"used_percent"`
}

type NetworkStats struct {
	TCPConnCount   int `json:"tcp_conn_count"`
	UDPConnCount   int `json:"udp_conn_count"`
	TotalSent      uint64 `json:"total_sent"`
	TotalReceived  uint64 `json:"total_received"`
}

type LoadAverage struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

type ConnectionStats struct {
	ESTABLISHED int `json:"established"`
	TIME_WAIT   int `json:"time_wait"`
	CLOSE_WAIT  int `json:"close_wait"`
	SYN_SENT    int `json:"syn_sent"`
	SYN_RECV    int `json:"syn_recv"`
	LISTEN      int `json:"listen"`
}

type OSInfo struct {
	Hostname string `json:"hostname"`
	Platform string `json:"platform"`
	Kernel   string `json:"kernel"`
}

func GetSystemStats(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID != 1 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "msg": "无权限"})
		return
	}

	stats := SystemStats{}

	stats.OSInfo.Hostname, _ = os.Hostname()
	stats.OSInfo.Platform = runtime.GOOS
	stats.OSInfo.Kernel, _ = kernelVersion()

	stats.CPU.Cores = runtime.NumCPU()
	stats.CPU.UsedPercent = getCPUUsage()
	stats.CPU.Model = getCPUModel()

	stats.Memory = getMemoryStats()
	stats.Disk = getDiskStats("/")
	stats.Network, stats.ConnCount = getNetworkStats()
	stats.LoadAvg = getLoadAverage()
	stats.Uptime = getUptime()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"code":    0,
		"data":    stats,
	})
}

func getCPUUsage() float64 {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "cpu ") {
			fields := strings.Fields(line)
			if len(fields) < 8 {
				return 0
			}
			var total, idle uint64
			for i := 1; i < len(fields); i++ {
				v, _ := strconv.ParseUint(fields[i], 10, 64)
				total += v
				if i == 4 {
					idle = v
				}
			}
			if total == 0 {
				return 0
			}
			return float64(total-idle) / float64(total) * 100
		}
	}
	return 0
}

func getCPUModel() string {
	data, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return "Unknown"
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "model name") {
			parts := strings.Split(line, ":")
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return "Unknown"
}

func getMemoryStats() MemoryStats {
	var mem MemoryStats
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return mem
	}
	lines := strings.Split(string(data), "\n")
	var memTotal, memFree, memAvailable uint64
	for _, line := range lines {
		if strings.HasPrefix(line, "MemTotal:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				memTotal, _ = strconv.ParseUint(parts[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "MemFree:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				memFree, _ = strconv.ParseUint(parts[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "MemAvailable:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				memAvailable, _ = strconv.ParseUint(parts[1], 10, 64)
			}
		}
	}
	mem.Total = memTotal * 1024
	if memAvailable == 0 {
		memAvailable = memFree
	}
	mem.Available = memAvailable * 1024
	mem.Used = mem.Total - mem.Available
	if mem.Total > 0 {
		mem.UsedPercent = float64(mem.Used) / float64(mem.Total) * 100
	}
	return mem
}

func getDiskStats(path string) DiskStats {
	var disk DiskStats
	cmd := exec.Command("df", "-B1", path)
	out, err := cmd.Output()
	if err != nil {
		return disk
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return disk
	}
	fields := strings.Fields(lines[1])
	if len(fields) >= 4 {
		disk.Total, _ = strconv.ParseUint(fields[1], 10, 64)
		disk.Used, _ = strconv.ParseUint(fields[2], 10, 64)
		avail, _ := strconv.ParseUint(fields[3], 10, 64)
		disk.Available = avail
		if disk.Total > 0 {
			disk.UsedPercent = float64(disk.Used) / float64(disk.Total) * 100
		}
	}
	return disk
}
func getNetworkStats() (NetworkStats, ConnectionStats) {
	var netStats NetworkStats
	var connStats ConnectionStats

	tcpData, _ := os.ReadFile("/proc/net/tcp")
	udpData, _ := os.ReadFile("/proc/net/udp")

	tcpLines := strings.Split(string(tcpData), "\n")
	udpLines := strings.Split(string(udpData), "\n")

	connStats.LISTEN = 0
	connStats.ESTABLISHED = 0
	connStats.TIME_WAIT = 0
	connStats.CLOSE_WAIT = 0

	for i, line := range tcpLines {
		if i == 0 {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 4 {
			state := fields[3]
			switch state {
			case "01":
				connStats.ESTABLISHED++
			case "06":
				connStats.TIME_WAIT++
			case "08":
				connStats.CLOSE_WAIT++
			case "02":
				connStats.SYN_SENT++
			case "04":
				connStats.SYN_RECV++
			case "0A":
				connStats.LISTEN++
			}
		}
	}

	netStats.TCPConnCount = len(tcpLines) - 1
	netStats.UDPConnCount = len(udpLines) - 1

	devData, _ := os.ReadFile("/proc/net/dev")
	netStats.TotalSent, netStats.TotalReceived = parseNetDev(string(devData))

	return netStats, connStats
}

func parseNetDev(data string) (sent, received uint64) {
	lines := strings.Split(data, "\n")
	for _, line := range lines {
		if strings.Contains(line, ":") && !strings.HasPrefix(strings.TrimSpace(line), "Inter") {
			fields := strings.Fields(line)
			if len(fields) >= 10 {
				sent += parseUint64Field(fields[9])
				received += parseUint64Field(fields[1])
			}
		}
	}
	return
}

func parseUint64Field(s string) uint64 {
	v, _ := strconv.ParseUint(s, 10, 64)
	return v
}

func getLoadAverage() LoadAverage {
	var load LoadAverage
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return load
	}
	fields := strings.Fields(string(data))
	if len(fields) >= 4 {
		load.Load1, _ = strconv.ParseFloat(fields[0], 64)
		load.Load5, _ = strconv.ParseFloat(fields[1], 64)
		load.Load15, _ = strconv.ParseFloat(fields[2], 64)
	}
	return load
}

func getUptime() string {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return "Unknown"
	}
	fields := strings.Fields(string(data))
	if len(fields) >= 1 {
		seconds, _ := strconv.ParseFloat(fields[0], 64)
		duration := time.Duration(int64(seconds)) * time.Second
		days := int(duration.Hours() / 24)
		hours := int(duration.Hours()) % 24
		minutes := int(duration.Minutes()) % 60
		if days > 0 {
			return fmt.Sprintf("%d天 %d小时 %d分钟", days, hours, minutes)
		}
		return fmt.Sprintf("%d小时 %d分钟", hours, minutes)
	}
	return "Unknown"
}

func kernelVersion() (string, error) {
	data, err := os.ReadFile("/proc/version")
	if err != nil {
		return "", err
	}
	fields := strings.Fields(string(data))
	if len(fields) >= 3 {
		return fields[2], nil
	}
	return "", nil
}
