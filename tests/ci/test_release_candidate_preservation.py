"""发布合同：已上传候选不重建，公开资产与标签不原地替换。"""

from pathlib import Path


WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/release.yml"


def test_draft_candidate_is_preserved_before_packaging() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    guard = workflow.index('if [ "$release_is_draft" = true ]; then')
    end = workflow.index('changed=1', guard)
    assert 'continue' in workflow[guard:end]
    assert guard < workflow.index('python .github/scripts/build_plugin_release_zip.py')
    assert 'gh release edit "$tag" --draft=false' not in workflow


def test_published_release_and_tag_cannot_be_replaced() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    assert 'Refusing to replace existing release' in workflow
    assert 'Refusing to move existing tag' in workflow
    assert workflow.index('Refusing to replace existing release') < workflow.index('echo "Packing')
    assert 'gh release delete' not in workflow
    assert 'git tag -d' not in workflow
    assert 'git push origin :refs/tags/' not in workflow
