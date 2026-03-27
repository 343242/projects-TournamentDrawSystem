/**
 * 大赛抽签算法
 *
 * 规则：
 * 1. 种子队优先分配到各组
 * 2. 同一学校的队伍不能放在同一组（除非学校队伍数量超过分组数量）
 * 3. 分组内队伍数量平均分配
 * 4. 所有组的人数差距不超过1
 */

class DrawAlgorithm {
  constructor(teams, groupCount) {
    this.teams = teams;
    this.groupCount = groupCount;
    this.groups = [];
    this.remainingTeams = [];
    this.drawnTeams = [];

    this.initialize();
  }

  initialize() {
    // 初始化分组
    for (let i = 0; i < this.groupCount; i++) {
      this.groups.push([]);
    }

    // 复制队伍列表
    this.remainingTeams = [...this.teams];
    this.drawnTeams = [];
  }

  /**
   * 获取每个组的目标队伍数
   */
  getTeamCountPerGroup() {
    const totalTeams = this.teams.length;
    const baseCount = Math.floor(totalTeams / this.groupCount);
    const remainder = totalTeams % this.groupCount;

    return {
      baseCount,
      remainder,
      getTarget: (groupIndex) => baseCount + (groupIndex < remainder ? 1 : 0)
    };
  }

  /**
   * 获取分组状态
   */
  getGroupStats() {
    const target = this.getTeamCountPerGroup();
    return this.groups.map((group, index) => ({
      index,
      count: group.length,
      target: target.getTarget(index),
      isFull: group.length >= target.getTarget(index),
      schools: new Set(group.map(t => t.school))
    }));
  }

  /**
   * 获取可以放置队伍的组
   */
  getAvailableGroups(team) {
    const stats = this.getGroupStats();
    const target = this.getTeamCountPerGroup();

    // 过滤掉已有同校队伍的组（除非该学校队伍数超过分组数）
    const schoolTeamCount = this.teams.filter(t => t.school === team.school).length;
    // FIX: 改为 >= 确保边界条件正确处理
    const allowSameSchool = schoolTeamCount >= this.groupCount;

    return stats.filter(stat => {
      // 组未满
      if (stat.count >= target.getTarget(stat.index)) return false;

      // 如果不允许同校，检查是否已有同校队伍
      if (!allowSameSchool && stat.schools.has(team.school)) return false;

      return true;
    });
  }

  /**
   * 分配种子队
   */
  allocateSeededTeams() {
    const seededTeams = this.remainingTeams.filter(t => t.isSeeded);
    const nonSeededTeams = this.remainingTeams.filter(t => !t.isSeeded);

    // 按学校分组，同校种子队需要分配到不同组
    const seededBySchool = {};
    seededTeams.forEach(team => {
      if (!seededBySchool[team.school]) {
        seededBySchool[team.school] = [];
      }
      seededBySchool[team.school].push(team);
    });

    // 先分配每个学校的第一个种子队
    const schools = Object.keys(seededBySchool);
    let groupIndex = 0;

    // 按学校种子队数量降序排序
    schools.sort((a, b) => seededBySchool[b].length - seededBySchool[a].length);

    schools.forEach(school => {
      seededBySchool[school].forEach((team, idx) => {
        // 找到一个可用的组
        let assigned = false;
        let startIdx = (groupIndex + idx) % this.groupCount;
        const target = this.getTeamCountPerGroup();

        for (let i = 0; i < this.groupCount && !assigned; i++) {
          const tryIdx = (startIdx + i) % this.groupCount;
          const group = this.groups[tryIdx];

          // 检查组是否已满
          if (group.length >= target.getTarget(tryIdx)) continue;

          // 检查是否已有同校队伍
          const hasSameSchool = group.some(t => t.school === team.school);

          if (!hasSameSchool) {
            group.push(team);
            this.drawnTeams.push({ team, groupIndex: tryIdx });
            this.remainingTeams = this.remainingTeams.filter(t => t !== team);
            assigned = true;
            groupIndex = (tryIdx + 1) % this.groupCount;
          }
        }

        // 如果所有组都有同校队伍或已满，强制分配到人数最少且最合适的组
        if (!assigned) {
          const minGroupIdx = this.findMinGroupForSchool(team.school);
          this.groups[minGroupIdx].push(team);
          this.drawnTeams.push({ team, groupIndex: minGroupIdx });
          this.remainingTeams = this.remainingTeams.filter(t => t !== team);
        }
      });
    });

    return { seeded: this.drawnTeams.length, remaining: this.remainingTeams.length };
  }

  /**
   * 找到适合某学校队伍的人数最少的组
   */
  findMinGroupForSchool(school) {
    const stats = this.getGroupStats();
    const target = this.getTeamCountPerGroup();

    // 过滤掉已满的组
    const availableStats = stats.filter(s => s.count < target.getTarget(s.index));

    // 如果所有组都满了，返回人数最少的组（强制分配）
    if (availableStats.length === 0) {
      stats.sort((a, b) => a.count - b.count);
      return stats[0].index;
    }

    // 优先找没有同校队伍且人数最少的组
    const noSchoolGroups = availableStats.filter(s => !s.schools.has(school));
    if (noSchoolGroups.length > 0) {
      noSchoolGroups.sort((a, b) => a.count - b.count);
      return noSchoolGroups[0].index;
    }

    // 如果所有可用组都有同校队伍，找人数最少的
    availableStats.sort((a, b) => a.count - b.count);
    return availableStats[0].index;
  }

  /**
   * 执行一次抽签（随机选择一个队伍分配）
   */
  drawOne() {
    if (this.remainingTeams.length === 0) {
      return null;
    }

    // 随机选择一个队伍
    const randomIndex = Math.floor(Math.random() * this.remainingTeams.length);
    const team = this.remainingTeams[randomIndex];

    // 获取可用组
    const availableGroups = this.getAvailableGroups(team);

    if (availableGroups.length === 0) {
      // 没有可用组，使用改进的强制分配逻辑
      const minGroupIdx = this.findMinGroupForSchool(team.school);
      this.groups[minGroupIdx].push(team);
      this.drawnTeams.push({ team, groupIndex: minGroupIdx });
      this.remainingTeams.splice(randomIndex, 1);
      return { team, groupIndex: minGroupIdx, forced: true };
    }

    // 优先分配到人数较少的组
    availableGroups.sort((a, b) => a.count - b.count);

    // 从人数最少的几个组中随机选择
    const minCount = availableGroups[0].count;
    const minGroups = availableGroups.filter(g => g.count === minCount);
    const selectedGroup = minGroups[Math.floor(Math.random() * minGroups.length)];

    this.groups[selectedGroup.index].push(team);
    this.drawnTeams.push({ team, groupIndex: selectedGroup.index });
    this.remainingTeams.splice(randomIndex, 1);

    return { team, groupIndex: selectedGroup.index, forced: false };
  }

  /**
   * 执行完整抽签
   */
  drawAll() {
    const results = [];

    // 先分配种子队
    this.allocateSeededTeams();

    // 分配剩余队伍
    while (this.remainingTeams.length > 0) {
      const result = this.drawOne();
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 获取当前分组结果
   */
  getGroups() {
    return this.groups.map((group, index) => ({
      index: index + 1,
      teams: [...group]
    }));
  }

  /**
   * 验证分组结果
   */
  validate() {
    const issues = [];
    const target = this.getTeamCountPerGroup();

    // 检查是否有空组
    const emptyGroups = this.groups.filter(g => g.length === 0);
    if (emptyGroups.length > 0) {
      issues.push(`存在 ${emptyGroups.length} 个空组`);
    }

    // 检查人数差距
    const counts = this.groups.map(g => g.length);
    const nonEmptyCounts = counts.filter(c => c > 0);
    if (nonEmptyCounts.length > 0) {
      const maxDiff = Math.max(...nonEmptyCounts) - Math.min(...nonEmptyCounts);
      if (maxDiff > 1) {
        issues.push(`组间人数差距超过1: ${maxDiff}`);
      }
    }

    // 检查所有队伍是否都已分配
    const totalAssigned = this.groups.reduce((sum, g) => sum + g.length, 0);
    if (totalAssigned !== this.teams.length) {
      issues.push(`队伍分配不完整: ${totalAssigned}/${this.teams.length}`);
    }

    // 检查同校队伍
    this.groups.forEach((group, index) => {
      const schools = {};
      group.forEach(team => {
        if (schools[team.school]) {
          const schoolTeamCount = this.teams.filter(t => t.school === team.school).length;
          // FIX: 改为 >= 边界条件
          if (schoolTeamCount < this.groupCount) {
            issues.push(`第${index + 1}组存在同校队伍: ${team.school}`);
          }
        }
        schools[team.school] = true;
      });
    });

    // 检查种子队是否优先分配
    const seededTeams = this.teams.filter(t => t.isSeeded);
    const seededInFirstPositions = seededTeams.filter(t => {
      const group = this.groups.find(g => g.includes(t));
      if (!group) return false;
      const seededInGroup = group.filter(team => team.isSeeded);
      return seededInGroup.indexOf(t) === 0;
    });

    return {
      valid: issues.length === 0,
      issues,
      stats: {
        totalTeams: this.teams.length,
        totalGroups: this.groupCount,
        assignedTeams: totalAssigned,
        seededTeams: seededTeams.length,
        groupCounts: counts
      }
    };
  }

  /**
   * 重置抽签
   */
  reset() {
    this.groups = [];
    this.remainingTeams = [];
    this.drawnTeams = [];
    this.initialize();
  }

  /**
   * 从已有 team.group 属性恢复分组状态（用于项目切换恢复）
   */
  restore() {
    this.groups = [];
    this.remainingTeams = [];
    this.drawnTeams = [];
    for (let i = 0; i < this.groupCount; i++) {
      this.groups.push([]);
    }
    this.teams.forEach(team => {
      if (team.group && team.group > 0 && team.group <= this.groupCount) {
        this.groups[team.group - 1].push(team);
        this.drawnTeams.push({ team, groupIndex: team.group - 1 });
      } else {
        this.remainingTeams.push(team);
      }
    });
  }
}

// ES Module 导出
export default DrawAlgorithm;

// 导出（用于Node.js环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DrawAlgorithm;
}
