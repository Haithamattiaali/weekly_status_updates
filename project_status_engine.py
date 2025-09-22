#!/usr/bin/env python3
"""
Enterprise Project Status Engine
Comprehensive project health evaluation and reporting system
"""

import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
from dataclasses import dataclass, field
import math


class StatusColor(Enum):
    """Project health status colors with PMO standards"""
    GREEN = "green"  # On plan within tolerance
    AMBER = "amber"  # Threatened but recoverable
    RED = "red"      # Off plan, needs escalation
    BLUE = "blue"    # Complete
    GREY = "grey"    # On hold/insufficient data


class TrendDirection(Enum):
    """Trend indicators for metrics"""
    UP = "↑"
    DOWN = "↓"
    FLAT = "→"


@dataclass
class HealthMetrics:
    """Quantitative health metrics for project evaluation"""
    spi: float = 1.0  # Schedule Performance Index
    cpi: float = 1.0  # Cost Performance Index
    quality_score: float = 1.0
    risk_score: float = 0.0
    defect_count: int = 0
    sev1_defects: int = 0
    sev2_defects: int = 0
    milestone_completion_rate: float = 1.0
    scope_change_percentage: float = 0.0
    resource_utilization: float = 1.0
    stakeholder_satisfaction: float = 1.0


@dataclass
class ProjectStatus:
    """Complete project status evaluation"""
    project_id: str
    project_name: str
    overall_status: StatusColor
    trend: TrendDirection
    health_metrics: HealthMetrics
    highlights: List[Dict[str, Any]]
    lowlights: List[Dict[str, Any]]
    confidence_score: float
    evaluation_date: datetime
    comparison_period: Dict[str, Any]


class RAGEvaluator:
    """RAG status evaluation algorithm based on PMO best practices"""

    # Thresholds for status determination
    THRESHOLDS = {
        'schedule': {
            'green': {'spi_min': 0.98, 'slip_max': 0.05},
            'amber': {'spi_min': 0.90, 'slip_max': 0.10},
            'red': {'spi_min': 0.0, 'slip_max': 1.0}
        },
        'cost': {
            'green': {'cpi_min': 0.98, 'eac_variance_max': 0.05},
            'amber': {'cpi_min': 0.90, 'eac_variance_max': 0.10},
            'red': {'cpi_min': 0.0, 'eac_variance_max': 1.0}
        },
        'quality': {
            'green': {'sev1_max': 0, 'sev2_max': 0, 'defect_trend_max': 0},
            'amber': {'sev1_max': 0, 'sev2_max': 3, 'defect_trend_max': 0.20},
            'red': {'sev1_max': 999, 'sev2_max': 999, 'defect_trend_max': 1.0}
        },
        'risk': {
            'green': {'high_risks_max': 0, 'risk_score_max': 0.3},
            'amber': {'high_risks_max': 1, 'risk_score_max': 0.6},
            'red': {'high_risks_max': 999, 'risk_score_max': 1.0}
        }
    }

    def evaluate_schedule_health(self, metrics: HealthMetrics) -> StatusColor:
        """Evaluate schedule dimension health"""
        spi = metrics.spi

        if spi >= self.THRESHOLDS['schedule']['green']['spi_min']:
            return StatusColor.GREEN
        elif spi >= self.THRESHOLDS['schedule']['amber']['spi_min']:
            return StatusColor.AMBER
        else:
            return StatusColor.RED

    def evaluate_cost_health(self, metrics: HealthMetrics) -> StatusColor:
        """Evaluate cost dimension health"""
        cpi = metrics.cpi

        if cpi >= self.THRESHOLDS['cost']['green']['cpi_min']:
            return StatusColor.GREEN
        elif cpi >= self.THRESHOLDS['cost']['amber']['cpi_min']:
            return StatusColor.AMBER
        else:
            return StatusColor.RED

    def evaluate_quality_health(self, metrics: HealthMetrics) -> StatusColor:
        """Evaluate quality dimension health"""
        if (metrics.sev1_defects <= self.THRESHOLDS['quality']['green']['sev1_max'] and
            metrics.sev2_defects <= self.THRESHOLDS['quality']['green']['sev2_max']):
            return StatusColor.GREEN
        elif (metrics.sev1_defects <= self.THRESHOLDS['quality']['amber']['sev1_max'] and
              metrics.sev2_defects <= self.THRESHOLDS['quality']['amber']['sev2_max']):
            return StatusColor.AMBER
        else:
            return StatusColor.RED

    def evaluate_risk_health(self, metrics: HealthMetrics) -> StatusColor:
        """Evaluate risk dimension health"""
        risk_score = metrics.risk_score

        if risk_score <= self.THRESHOLDS['risk']['green']['risk_score_max']:
            return StatusColor.GREEN
        elif risk_score <= self.THRESHOLDS['risk']['amber']['risk_score_max']:
            return StatusColor.AMBER
        else:
            return StatusColor.RED

    def calculate_overall_status(self, metrics: HealthMetrics) -> Tuple[StatusColor, float]:
        """
        Calculate overall project status using worst-of rule
        Returns status and confidence score
        """
        # Evaluate each dimension
        schedule_status = self.evaluate_schedule_health(metrics)
        cost_status = self.evaluate_cost_health(metrics)
        quality_status = self.evaluate_quality_health(metrics)
        risk_status = self.evaluate_risk_health(metrics)

        # Map status to severity for worst-of calculation
        severity_map = {
            StatusColor.GREEN: 0,
            StatusColor.AMBER: 1,
            StatusColor.RED: 2
        }

        statuses = [schedule_status, cost_status, quality_status, risk_status]
        severities = [severity_map.get(s, 0) for s in statuses]
        worst_severity = max(severities)

        # Calculate confidence score based on data completeness
        data_points = [
            metrics.spi != 1.0,
            metrics.cpi != 1.0,
            metrics.quality_score != 1.0,
            metrics.risk_score != 0.0,
            metrics.milestone_completion_rate != 1.0
        ]
        confidence = sum(data_points) / len(data_points)

        # Map back to status
        status_map = {0: StatusColor.GREEN, 1: StatusColor.AMBER, 2: StatusColor.RED}
        overall_status = status_map[worst_severity]

        return overall_status, confidence


class HighlightDetector:
    """Detect highlights and lowlights based on material impact"""

    HIGHLIGHT_TRIGGERS = {
        'schedule': {
            'spi_threshold': 1.05,
            'early_completion_days': 5,
            'milestone_early': True
        },
        'cost': {
            'cpi_threshold': 1.05,
            'savings_percentage': 0.03
        },
        'quality': {
            'defect_reduction': 0.20,
            'zero_sev1': True,
            'test_coverage_target': 0.80
        },
        'risk': {
            'risk_retired': True,
            'risk_reduced': True
        }
    }

    LOWLIGHT_TRIGGERS = {
        'schedule': {
            'spi_threshold': 0.95,
            'slip_days': 7,
            'slip_percentage': 0.05
        },
        'cost': {
            'cpi_threshold': 0.95,
            'overrun_percentage': 0.03
        },
        'quality': {
            'sev1_count': 1,
            'sev2_count': 3,
            'defect_escape': True
        },
        'risk': {
            'new_high_risk': True,
            'dependency_slip': True
        }
    }

    def detect_highlights(self, current_metrics: HealthMetrics,
                         previous_metrics: Optional[HealthMetrics],
                         project_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Detect project highlights based on positive material changes"""
        highlights = []

        # Schedule highlights
        if current_metrics.spi >= self.HIGHLIGHT_TRIGGERS['schedule']['spi_threshold']:
            highlights.append({
                'category': 'schedule',
                'title': 'Schedule Performance Exceeds Target',
                'description': f'SPI at {current_metrics.spi:.2f}, indicating ahead of schedule',
                'impact': 'positive',
                'metric': f'SPI: {current_metrics.spi:.2f}'
            })

        # Cost highlights
        if current_metrics.cpi >= self.HIGHLIGHT_TRIGGERS['cost']['cpi_threshold']:
            highlights.append({
                'category': 'cost',
                'title': 'Cost Performance Under Budget',
                'description': f'CPI at {current_metrics.cpi:.2f}, indicating cost savings',
                'impact': 'positive',
                'metric': f'CPI: {current_metrics.cpi:.2f}'
            })

        # Quality highlights
        if current_metrics.sev1_defects == 0 and current_metrics.sev2_defects == 0:
            highlights.append({
                'category': 'quality',
                'title': 'Zero Critical Defects',
                'description': 'No Severity 1 or 2 defects in current period',
                'impact': 'positive',
                'metric': 'Sev-1: 0, Sev-2: 0'
            })

        # Milestone completion
        if current_metrics.milestone_completion_rate > 0.95:
            highlights.append({
                'category': 'delivery',
                'title': 'Strong Milestone Achievement',
                'description': f'{current_metrics.milestone_completion_rate:.0%} milestone completion rate',
                'impact': 'positive',
                'metric': f'Completion: {current_metrics.milestone_completion_rate:.0%}'
            })

        return highlights

    def detect_lowlights(self, current_metrics: HealthMetrics,
                        previous_metrics: Optional[HealthMetrics],
                        project_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Detect project lowlights based on negative material changes"""
        lowlights = []

        # Schedule lowlights
        if current_metrics.spi <= self.LOWLIGHT_TRIGGERS['schedule']['spi_threshold']:
            lowlights.append({
                'category': 'schedule',
                'title': 'Schedule Slippage Detected',
                'description': f'SPI at {current_metrics.spi:.2f}, indicating behind schedule',
                'impact': 'negative',
                'metric': f'SPI: {current_metrics.spi:.2f}',
                'action_required': 'Schedule recovery plan needed'
            })

        # Cost lowlights
        if current_metrics.cpi <= self.LOWLIGHT_TRIGGERS['cost']['cpi_threshold']:
            lowlights.append({
                'category': 'cost',
                'title': 'Cost Overrun Risk',
                'description': f'CPI at {current_metrics.cpi:.2f}, indicating cost overrun',
                'impact': 'negative',
                'metric': f'CPI: {current_metrics.cpi:.2f}',
                'action_required': 'Cost mitigation strategy required'
            })

        # Quality lowlights
        if current_metrics.sev1_defects >= self.LOWLIGHT_TRIGGERS['quality']['sev1_count']:
            lowlights.append({
                'category': 'quality',
                'title': 'Critical Defects Present',
                'description': f'{current_metrics.sev1_defects} Severity 1 defects open',
                'impact': 'negative',
                'metric': f'Sev-1: {current_metrics.sev1_defects}',
                'action_required': 'Immediate defect resolution required'
            })

        # Risk lowlights
        if current_metrics.risk_score > 0.6:
            lowlights.append({
                'category': 'risk',
                'title': 'High Risk Exposure',
                'description': f'Risk score at {current_metrics.risk_score:.2f}',
                'impact': 'negative',
                'metric': f'Risk Score: {current_metrics.risk_score:.2f}',
                'action_required': 'Risk mitigation plan needed'
            })

        return lowlights


class ProjectComparator:
    """Compare project metrics across different time periods"""

    def calculate_7day_comparison(self, current_data: Dict[str, Any],
                                 historical_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate 7-day rolling comparison for trend analysis"""
        current_date = datetime.now()
        seven_days_ago = current_date - timedelta(days=7)
        fourteen_days_ago = current_date - timedelta(days=14)

        # Get data for comparison periods
        recent_period = self._filter_period_data(historical_data, seven_days_ago, current_date)
        previous_period = self._filter_period_data(historical_data, fourteen_days_ago, seven_days_ago)

        comparison = {
            'current_period': {
                'start': seven_days_ago.isoformat(),
                'end': current_date.isoformat(),
                'metrics': self._aggregate_metrics(recent_period)
            },
            'previous_period': {
                'start': fourteen_days_ago.isoformat(),
                'end': seven_days_ago.isoformat(),
                'metrics': self._aggregate_metrics(previous_period)
            },
            'trends': self._calculate_trends(recent_period, previous_period)
        }

        return comparison

    def _filter_period_data(self, data: List[Dict[str, Any]],
                           start: datetime, end: datetime) -> List[Dict[str, Any]]:
        """Filter data for specific time period"""
        filtered = []
        for item in data:
            if 'date' in item:
                item_date = datetime.fromisoformat(item['date'])
                if start <= item_date <= end:
                    filtered.append(item)
        return filtered

    def _aggregate_metrics(self, period_data: List[Dict[str, Any]]) -> Dict[str, float]:
        """Aggregate metrics for a period"""
        if not period_data:
            return {
                'avg_spi': 1.0,
                'avg_cpi': 1.0,
                'total_issues': 0,
                'completion_rate': 0.0
            }

        metrics = {
            'avg_spi': sum(d.get('spi', 1.0) for d in period_data) / len(period_data),
            'avg_cpi': sum(d.get('cpi', 1.0) for d in period_data) / len(period_data),
            'total_issues': sum(d.get('issues', 0) for d in period_data),
            'completion_rate': sum(d.get('completion', 0) for d in period_data) / len(period_data)
        }

        return metrics

    def _calculate_trends(self, recent: List[Dict[str, Any]],
                         previous: List[Dict[str, Any]]) -> Dict[str, TrendDirection]:
        """Calculate trend directions between periods"""
        recent_metrics = self._aggregate_metrics(recent)
        previous_metrics = self._aggregate_metrics(previous)

        trends = {}

        # SPI trend
        if recent_metrics['avg_spi'] > previous_metrics['avg_spi'] * 1.02:
            trends['schedule'] = TrendDirection.UP
        elif recent_metrics['avg_spi'] < previous_metrics['avg_spi'] * 0.98:
            trends['schedule'] = TrendDirection.DOWN
        else:
            trends['schedule'] = TrendDirection.FLAT

        # CPI trend
        if recent_metrics['avg_cpi'] > previous_metrics['avg_cpi'] * 1.02:
            trends['cost'] = TrendDirection.UP
        elif recent_metrics['avg_cpi'] < previous_metrics['avg_cpi'] * 0.98:
            trends['cost'] = TrendDirection.DOWN
        else:
            trends['cost'] = TrendDirection.FLAT

        # Issues trend (inverse - fewer is better)
        if recent_metrics['total_issues'] < previous_metrics['total_issues'] * 0.9:
            trends['quality'] = TrendDirection.UP
        elif recent_metrics['total_issues'] > previous_metrics['total_issues'] * 1.1:
            trends['quality'] = TrendDirection.DOWN
        else:
            trends['quality'] = TrendDirection.FLAT

        return trends


class ProjectStatusEngine:
    """Main engine for comprehensive project status evaluation"""

    def __init__(self):
        self.evaluator = RAGEvaluator()
        self.detector = HighlightDetector()
        self.comparator = ProjectComparator()

    def evaluate_project(self, project_data: Dict[str, Any],
                        historical_data: Optional[List[Dict[str, Any]]] = None) -> ProjectStatus:
        """
        Comprehensive project evaluation with all dimensions
        """
        # Extract or calculate metrics
        metrics = self._extract_metrics(project_data)

        # Calculate RAG status
        overall_status, confidence = self.evaluator.calculate_overall_status(metrics)

        # Detect highlights and lowlights
        highlights = self.detector.detect_highlights(metrics, None, project_data)
        lowlights = self.detector.detect_lowlights(metrics, None, project_data)

        # Calculate comparison if historical data available
        comparison = {}
        trend = TrendDirection.FLAT
        if historical_data:
            comparison = self.comparator.calculate_7day_comparison(project_data, historical_data)
            trends = comparison.get('trends', {})
            # Overall trend based on majority
            trend_values = list(trends.values())
            if trend_values:
                trend = max(set(trend_values), key=trend_values.count)

        return ProjectStatus(
            project_id=project_data.get('id', 'unknown'),
            project_name=project_data.get('name', 'Unknown Project'),
            overall_status=overall_status,
            trend=trend,
            health_metrics=metrics,
            highlights=highlights,
            lowlights=lowlights,
            confidence_score=confidence,
            evaluation_date=datetime.now(),
            comparison_period=comparison
        )

    def _extract_metrics(self, project_data: Dict[str, Any]) -> HealthMetrics:
        """Extract health metrics from project data"""
        # Calculate SPI from milestones
        milestones = project_data.get('milestones', [])
        completed = sum(1 for m in milestones if m.get('status') == 'completed')
        total = len(milestones) if milestones else 1
        milestone_rate = completed / total if total > 0 else 0

        # Calculate other metrics from available data
        risks = project_data.get('risks', [])
        high_risks = sum(1 for r in risks if r.get('severity') == 'high')
        risk_score = min(high_risks * 0.3, 1.0)

        # Extract KPI values
        kpis = project_data.get('kpis', [])
        issues_kpi = next((k for k in kpis if 'issue' in k.get('metric', '').lower()), {})
        issue_count = issues_kpi.get('value', 0)

        # Estimate SPI and CPI based on available data
        spi = 0.95 if any(m.get('status') == 'at-risk' for m in milestones) else 1.02
        cpi = 0.98  # Default assumption without cost data

        # Count defects from issues
        sev1_defects = max(0, issue_count // 10)  # Estimate critical issues
        sev2_defects = max(0, issue_count // 5 - sev1_defects)

        return HealthMetrics(
            spi=spi,
            cpi=cpi,
            quality_score=1.0 - (issue_count / 100) if issue_count < 100 else 0.0,
            risk_score=risk_score,
            defect_count=issue_count,
            sev1_defects=sev1_defects,
            sev2_defects=sev2_defects,
            milestone_completion_rate=milestone_rate,
            scope_change_percentage=0.0,
            resource_utilization=1.0,
            stakeholder_satisfaction=0.85
        )

    def generate_status_report(self, projects: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate comprehensive status report for multiple projects"""
        evaluated_projects = []

        for project in projects:
            status = self.evaluate_project(project)
            evaluated_projects.append({
                'project': project.get('name'),
                'status': status.overall_status.value,
                'trend': status.trend.value,
                'confidence': f'{status.confidence_score:.0%}',
                'highlights': status.highlights,
                'lowlights': status.lowlights,
                'metrics': {
                    'spi': status.health_metrics.spi,
                    'cpi': status.health_metrics.cpi,
                    'quality': status.health_metrics.quality_score,
                    'risk': status.health_metrics.risk_score
                }
            })

        return {
            'report_date': datetime.now().isoformat(),
            'projects': evaluated_projects,
            'summary': self._generate_summary(evaluated_projects)
        }

    def _generate_summary(self, projects: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate executive summary across all projects"""
        total = len(projects)
        green = sum(1 for p in projects if p['status'] == 'green')
        amber = sum(1 for p in projects if p['status'] == 'amber')
        red = sum(1 for p in projects if p['status'] == 'red')

        return {
            'total_projects': total,
            'health_distribution': {
                'green': green,
                'amber': amber,
                'red': red
            },
            'health_percentage': {
                'green': f'{(green/total*100):.0f}%' if total > 0 else '0%',
                'amber': f'{(amber/total*100):.0f}%' if total > 0 else '0%',
                'red': f'{(red/total*100):.0f}%' if total > 0 else '0%'
            }
        }


# Example usage and testing
if __name__ == "__main__":
    # Load the existing project data
    with open('project_update_B2B_FarEye_2025-09-17.json', 'r') as f:
        fareye_project = json.load(f)

    # Initialize the engine
    engine = ProjectStatusEngine()

    # Evaluate the project
    status = engine.evaluate_project(fareye_project)

    # Print evaluation results
    print(f"Project: {fareye_project['project']['name']}")
    print(f"Overall Status: {status.overall_status.value.upper()}")
    print(f"Trend: {status.trend.value}")
    print(f"Confidence: {status.confidence_score:.0%}")
    print(f"\nHighlights: {len(status.highlights)}")
    for h in status.highlights:
        print(f"  - {h['title']}: {h['description']}")
    print(f"\nLowlights: {len(status.lowlights)}")
    for l in status.lowlights:
        print(f"  - {l['title']}: {l['description']}")