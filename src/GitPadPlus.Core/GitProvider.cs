// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.Core;
public interface IGitProvider
{
    Task<GitStatus> GetStatusAsync(CancellationToken cancellationToken = default);
}
public sealed class UnconfiguredGitProvider : IGitProvider
{
    public Task<GitStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new GitStatus("NotConfigured"));
    }
}
